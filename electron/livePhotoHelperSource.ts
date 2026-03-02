export const LIVE_PHOTO_HELPER_OBJECTIVE_C_SOURCE = String.raw`#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <ImageIO/ImageIO.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreGraphics/CoreGraphics.h>

static NSString * const kHelperErrorDomain = @"com.batchclip.livephoto-helper";

typedef NS_ENUM(NSInteger, HelperErrorCode) {
  HelperErrorInvalidArguments = 1,
  HelperErrorImageSourceCreateFailed,
  HelperErrorImageDecodeFailed,
  HelperErrorImageDestinationCreateFailed,
  HelperErrorImageWriteFailed,
  HelperErrorMissingVideoTrack,
  HelperErrorReaderCreateFailed,
  HelperErrorWriterCreateFailed,
  HelperErrorReaderAddOutputFailed,
  HelperErrorWriterAddInputFailed,
  HelperErrorMetadataFormatCreateFailed,
  HelperErrorMetadataAppendFailed,
  HelperErrorReaderStartFailed,
  HelperErrorWriterStartFailed,
  HelperErrorReaderFailed,
  HelperErrorWriterFailed,
  HelperErrorTimeout
};

static NSError *MakeError(HelperErrorCode code, NSString *message) {
  NSDictionary *userInfo = @{
    NSLocalizedDescriptionKey: message ?: @"Unknown error"
  };
  return [NSError errorWithDomain:kHelperErrorDomain code:code userInfo:userInfo];
}

static NSString *GetRequiredArgument(NSDictionary<NSString *, NSString *> *args, NSString *key) {
  NSString *value = args[key];
  if (value == nil || value.length == 0) {
    return nil;
  }
  return value;
}

static BOOL ParseArguments(int argc, const char *argv[], NSDictionary<NSString *, NSString *> **outArguments, NSError **error) {
  NSMutableDictionary<NSString *, NSString *> *arguments = [NSMutableDictionary dictionary];
  for (int i = 1; i < argc; i += 2) {
    if (i + 1 >= argc) {
      if (error) {
        *error = MakeError(HelperErrorInvalidArguments, @"Expected --key value pairs");
      }
      return NO;
    }

    NSString *key = [NSString stringWithUTF8String:argv[i]];
    NSString *value = [NSString stringWithUTF8String:argv[i + 1]];
    if (![key hasPrefix:@"--"] || value.length == 0) {
      if (error) {
        *error = MakeError(HelperErrorInvalidArguments, @"Invalid argument format");
      }
      return NO;
    }

    arguments[key] = value;
  }

  NSArray<NSString *> *requiredKeys = @[
    @"--photo-input",
    @"--video-input",
    @"--photo-output",
    @"--video-output",
    @"--asset-id"
  ];

  for (NSString *requiredKey in requiredKeys) {
    if (GetRequiredArgument(arguments, requiredKey) == nil) {
      if (error) {
        *error = MakeError(HelperErrorInvalidArguments, [NSString stringWithFormat:@"Missing required argument: %@", requiredKey]);
      }
      return NO;
    }
  }

  if (outArguments) {
    *outArguments = arguments;
  }

  return YES;
}

static BOOL EnsureParentDirectory(NSURL *url, NSError **error) {
  NSURL *parent = [url URLByDeletingLastPathComponent];
  return [[NSFileManager defaultManager] createDirectoryAtURL:parent withIntermediateDirectories:YES attributes:nil error:error];
}

static BOOL RemoveIfExists(NSURL *url, NSError **error) {
  NSFileManager *fileManager = [NSFileManager defaultManager];
  if (![fileManager fileExistsAtPath:url.path]) {
    return YES;
  }
  return [fileManager removeItemAtURL:url error:error];
}

static BOOL WriteLivePhotoImage(NSURL *photoInput, NSURL *photoOutput, NSString *assetIdentifier, NSError **error) {
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)photoInput, NULL);
  if (source == NULL) {
    if (error) {
      *error = MakeError(HelperErrorImageSourceCreateFailed, @"Failed to create image source");
    }
    return NO;
  }

  CGImageRef image = CGImageSourceCreateImageAtIndex(source, 0, NULL);
  if (image == NULL) {
    CFRelease(source);
    if (error) {
      *error = MakeError(HelperErrorImageDecodeFailed, @"Failed to decode source image");
    }
    return NO;
  }

  CFDictionaryRef copiedProperties = CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
  NSMutableDictionary *properties = copiedProperties
    ? [(__bridge NSDictionary *)copiedProperties mutableCopy]
    : [NSMutableDictionary dictionary];
  if (copiedProperties != NULL) {
    CFRelease(copiedProperties);
  }

  NSMutableDictionary *makerApple = [properties[(NSString *)kCGImagePropertyMakerAppleDictionary] mutableCopy];
  if (makerApple == nil) {
    makerApple = [NSMutableDictionary dictionary];
  }
  makerApple[@"17"] = assetIdentifier;
  makerApple[@"23"] = @0;
  properties[(NSString *)kCGImagePropertyMakerAppleDictionary] = makerApple;

  CGImageDestinationRef destination = CGImageDestinationCreateWithURL(
    (__bridge CFURLRef)photoOutput,
    CFSTR("public.heic"),
    1,
    NULL
  );
  if (destination == NULL) {
    CGImageRelease(image);
    CFRelease(source);
    if (error) {
      *error = MakeError(HelperErrorImageDestinationCreateFailed, @"Failed to create HEIC destination");
    }
    return NO;
  }

  CGImageDestinationAddImage(destination, image, (__bridge CFDictionaryRef)properties);
  BOOL finalized = CGImageDestinationFinalize(destination);

  CFRelease(destination);
  CGImageRelease(image);
  CFRelease(source);

  if (!finalized) {
    if (error) {
      *error = MakeError(HelperErrorImageWriteFailed, @"Failed to write HEIC image");
    }
    return NO;
  }

  return YES;
}

static AVAssetWriterInputMetadataAdaptor *CreateStillImageMetadataAdaptor(NSError **error) {
  NSDictionary *specification = @{
    (__bridge NSString *)kCMMetadataFormatDescriptionMetadataSpecificationKey_Identifier: @"mdta/com.apple.quicktime.still-image-time",
    (__bridge NSString *)kCMMetadataFormatDescriptionMetadataSpecificationKey_DataType: (__bridge NSString *)kCMMetadataBaseDataType_SInt8
  };

  CMFormatDescriptionRef formatDescription = NULL;
  OSStatus status = CMMetadataFormatDescriptionCreateWithMetadataSpecifications(
    kCFAllocatorDefault,
    kCMMetadataFormatType_Boxed,
    (__bridge CFArrayRef)@[specification],
    &formatDescription
  );
  if (status != noErr || formatDescription == NULL) {
    if (error) {
      *error = MakeError(
        HelperErrorMetadataFormatCreateFailed,
        [NSString stringWithFormat:@"Failed to create metadata format description: %d", (int)status]
      );
    }
    return nil;
  }

  AVAssetWriterInput *input = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeMetadata outputSettings:nil sourceFormatHint:formatDescription];
  input.expectsMediaDataInRealTime = NO;
  AVAssetWriterInputMetadataAdaptor *adaptor = [AVAssetWriterInputMetadataAdaptor assetWriterInputMetadataAdaptorWithAssetWriterInput:input];

  CFRelease(formatDescription);
  return adaptor;
}

static void CopySamples(AVAssetReaderOutput *readerOutput, AVAssetWriterInput *writerInput, dispatch_queue_t queue, dispatch_group_t group) {
  dispatch_group_enter(group);
  __block BOOL finished = NO;
  [writerInput requestMediaDataWhenReadyOnQueue:queue usingBlock:^{
    if (finished) {
      return;
    }

    while (writerInput.readyForMoreMediaData) {
      CMSampleBufferRef sample = [readerOutput copyNextSampleBuffer];
      if (sample != NULL) {
        BOOL appended = [writerInput appendSampleBuffer:sample];
        CFRelease(sample);
        if (!appended) {
          finished = YES;
          [writerInput markAsFinished];
          dispatch_group_leave(group);
          return;
        }
      } else {
        finished = YES;
        [writerInput markAsFinished];
        dispatch_group_leave(group);
        return;
      }
    }
  }];
}

static BOOL WriteLivePhotoVideo(NSURL *videoInput, NSURL *videoOutput, NSString *assetIdentifier, NSError **error) {
  AVURLAsset *asset = [AVURLAsset URLAssetWithURL:videoInput options:nil];
  AVAssetTrack *videoTrack = [[asset tracksWithMediaType:AVMediaTypeVideo] firstObject];
  if (videoTrack == nil) {
    if (error) {
      *error = MakeError(HelperErrorMissingVideoTrack, @"Input video has no video track");
    }
    return NO;
  }
  AVAssetTrack *audioTrack = [[asset tracksWithMediaType:AVMediaTypeAudio] firstObject];

  NSError *readerError = nil;
  AVAssetReader *reader = [[AVAssetReader alloc] initWithAsset:asset error:&readerError];
  if (reader == nil) {
    if (error) {
      *error = MakeError(
        HelperErrorReaderCreateFailed,
        [NSString stringWithFormat:@"Failed to create AVAssetReader: %@", readerError.localizedDescription ?: @"unknown"]
      );
    }
    return NO;
  }

  NSError *writerError = nil;
  AVAssetWriter *writer = [AVAssetWriter assetWriterWithURL:videoOutput fileType:AVFileTypeQuickTimeMovie error:&writerError];
  if (writer == nil) {
    if (error) {
      *error = MakeError(
        HelperErrorWriterCreateFailed,
        [NSString stringWithFormat:@"Failed to create AVAssetWriter: %@", writerError.localizedDescription ?: @"unknown"]
      );
    }
    return NO;
  }

  AVAssetReaderTrackOutput *videoReaderOutput = [[AVAssetReaderTrackOutput alloc] initWithTrack:videoTrack outputSettings:nil];
  videoReaderOutput.alwaysCopiesSampleData = NO;
  if (![reader canAddOutput:videoReaderOutput]) {
    if (error) {
      *error = MakeError(HelperErrorReaderAddOutputFailed, @"Failed to add reader video output");
    }
    return NO;
  }
  [reader addOutput:videoReaderOutput];

  CMFormatDescriptionRef videoFormatHint = (__bridge CMFormatDescriptionRef)videoTrack.formatDescriptions.firstObject;
  AVAssetWriterInput *videoWriterInput = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo outputSettings:nil sourceFormatHint:videoFormatHint];
  videoWriterInput.expectsMediaDataInRealTime = NO;
  if (![writer canAddInput:videoWriterInput]) {
    if (error) {
      *error = MakeError(HelperErrorWriterAddInputFailed, @"Failed to add writer video input");
    }
    return NO;
  }
  [writer addInput:videoWriterInput];

  AVAssetReaderTrackOutput *audioReaderOutput = nil;
  AVAssetWriterInput *audioWriterInput = nil;
  if (audioTrack != nil) {
    AVAssetReaderTrackOutput *candidateAudioReaderOutput = [[AVAssetReaderTrackOutput alloc] initWithTrack:audioTrack outputSettings:nil];
    candidateAudioReaderOutput.alwaysCopiesSampleData = NO;
    if ([reader canAddOutput:candidateAudioReaderOutput]) {
      [reader addOutput:candidateAudioReaderOutput];
      audioReaderOutput = candidateAudioReaderOutput;
    }

    CMFormatDescriptionRef audioFormatHint = (__bridge CMFormatDescriptionRef)audioTrack.formatDescriptions.firstObject;
    AVAssetWriterInput *candidateAudioWriterInput = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeAudio outputSettings:nil sourceFormatHint:audioFormatHint];
    candidateAudioWriterInput.expectsMediaDataInRealTime = NO;
    if ([writer canAddInput:candidateAudioWriterInput]) {
      [writer addInput:candidateAudioWriterInput];
      audioWriterInput = candidateAudioWriterInput;
    }
  }

  NSError *metadataError = nil;
  AVAssetWriterInputMetadataAdaptor *metadataAdaptor = CreateStillImageMetadataAdaptor(&metadataError);
  if (metadataAdaptor == nil) {
    if (error) {
      *error = metadataError;
    }
    return NO;
  }

  AVAssetWriterInput *metadataInput = metadataAdaptor.assetWriterInput;
  if (![writer canAddInput:metadataInput]) {
    if (error) {
      *error = MakeError(HelperErrorWriterAddInputFailed, @"Failed to add writer metadata input");
    }
    return NO;
  }
  [writer addInput:metadataInput];

  AVMutableMetadataItem *contentIdentifierItem = [AVMutableMetadataItem metadataItem];
  contentIdentifierItem.keySpace = AVMetadataKeySpaceQuickTimeMetadata;
  contentIdentifierItem.key = AVMetadataQuickTimeMetadataKeyContentIdentifier;
  contentIdentifierItem.value = assetIdentifier;
  writer.metadata = @[contentIdentifierItem];

  if (![reader startReading]) {
    if (error) {
      *error = MakeError(
        HelperErrorReaderStartFailed,
        [NSString stringWithFormat:@"Failed to start reading: %@", reader.error.localizedDescription ?: @"unknown"]
      );
    }
    return NO;
  }
  if (![writer startWriting]) {
    if (error) {
      *error = MakeError(
        HelperErrorWriterStartFailed,
        [NSString stringWithFormat:@"Failed to start writing: %@", writer.error.localizedDescription ?: @"unknown"]
      );
    }
    return NO;
  }

  [writer startSessionAtSourceTime:kCMTimeZero];
  dispatch_group_t copyGroup = dispatch_group_create();
  CopySamples(videoReaderOutput, videoWriterInput, dispatch_queue_create("livephoto.video.copy", DISPATCH_QUEUE_SERIAL), copyGroup);
  if (audioReaderOutput != nil && audioWriterInput != nil) {
    CopySamples(audioReaderOutput, audioWriterInput, dispatch_queue_create("livephoto.audio.copy", DISPATCH_QUEUE_SERIAL), copyGroup);
  }

  dispatch_group_enter(copyGroup);
  __block BOOL metadataFinished = NO;
  __block NSError *appendMetadataError = nil;
  [metadataInput requestMediaDataWhenReadyOnQueue:dispatch_queue_create("livephoto.metadata.write", DISPATCH_QUEUE_SERIAL) usingBlock:^{
    if (metadataFinished) {
      return;
    }
    if (!metadataInput.readyForMoreMediaData) {
      return;
    }

    metadataFinished = YES;
    AVMutableMetadataItem *stillImageTimeItem = [AVMutableMetadataItem metadataItem];
    stillImageTimeItem.keySpace = AVMetadataKeySpaceQuickTimeMetadata;
    stillImageTimeItem.key = @"com.apple.quicktime.still-image-time";
    stillImageTimeItem.value = @((int8_t)0);

    CMTimeRange timeRange = CMTimeRangeMake(kCMTimeZero, CMTimeMake(1, 1000));
    AVTimedMetadataGroup *timedGroup = [[AVTimedMetadataGroup alloc] initWithItems:@[stillImageTimeItem] timeRange:timeRange];
    if (![metadataAdaptor appendTimedMetadataGroup:timedGroup]) {
      appendMetadataError = MakeError(HelperErrorMetadataAppendFailed, @"Failed to append still-image-time metadata");
    }

    [metadataInput markAsFinished];
    dispatch_group_leave(copyGroup);
  }];

  dispatch_group_wait(copyGroup, DISPATCH_TIME_FOREVER);

  if (appendMetadataError != nil) {
    if (error) {
      *error = appendMetadataError;
    }
    return NO;
  }

  if (reader.status == AVAssetReaderStatusFailed) {
    if (error) {
      *error = MakeError(
        HelperErrorReaderFailed,
        [NSString stringWithFormat:@"Reader failed: %@", reader.error.localizedDescription ?: @"unknown"]
      );
    }
    return NO;
  }

  dispatch_semaphore_t finishSemaphore = dispatch_semaphore_create(0);
  __block NSError *writerFinishError = nil;
  [writer finishWritingWithCompletionHandler:^{
    if (writer.status == AVAssetWriterStatusFailed) {
      writerFinishError = MakeError(
        HelperErrorWriterFailed,
        [NSString stringWithFormat:@"Writer failed: %@", writer.error.localizedDescription ?: @"unknown"]
      );
    } else if (writer.status != AVAssetWriterStatusCompleted) {
      writerFinishError = MakeError(
        HelperErrorWriterFailed,
        [NSString stringWithFormat:@"Writer failed with status: %ld", (long)writer.status]
      );
    }
    dispatch_semaphore_signal(finishSemaphore);
  }];

  if (dispatch_semaphore_wait(finishSemaphore, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(120 * NSEC_PER_SEC))) != 0) {
    if (error) {
      *error = MakeError(HelperErrorTimeout, @"Writer timed out");
    }
    return NO;
  }

  if (writerFinishError != nil) {
    if (error) {
      *error = writerFinishError;
    }
    return NO;
  }

  return YES;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSError *error = nil;
    NSDictionary<NSString *, NSString *> *arguments = nil;
    if (!ParseArguments(argc, argv, &arguments, &error)) {
      fprintf(stderr, "ERROR: %s\n", (error.localizedDescription ?: @"Invalid arguments").UTF8String);
      return 1;
    }

    NSURL *photoInput = [NSURL fileURLWithPath:arguments[@"--photo-input"]];
    NSURL *videoInput = [NSURL fileURLWithPath:arguments[@"--video-input"]];
    NSURL *photoOutput = [NSURL fileURLWithPath:arguments[@"--photo-output"]];
    NSURL *videoOutput = [NSURL fileURLWithPath:arguments[@"--video-output"]];
    NSString *assetIdentifier = arguments[@"--asset-id"];

    if (!EnsureParentDirectory(photoOutput, &error) || !EnsureParentDirectory(videoOutput, &error)) {
      fprintf(stderr, "ERROR: %s\n", (error.localizedDescription ?: @"Failed to create output directories").UTF8String);
      return 1;
    }

    if (!RemoveIfExists(photoOutput, &error) || !RemoveIfExists(videoOutput, &error)) {
      fprintf(stderr, "ERROR: %s\n", (error.localizedDescription ?: @"Failed to remove existing output files").UTF8String);
      return 1;
    }

    if (!WriteLivePhotoImage(photoInput, photoOutput, assetIdentifier, &error)) {
      fprintf(stderr, "ERROR: %s\n", (error.localizedDescription ?: @"Failed to write live photo image").UTF8String);
      return 1;
    }

    error = nil;
    if (!WriteLivePhotoVideo(videoInput, videoOutput, assetIdentifier, &error)) {
      fprintf(stderr, "ERROR: %s\n", (error.localizedDescription ?: @"Failed to write live photo video").UTF8String);
      return 1;
    }

    printf("OK\n");
    return 0;
  }
}
`;
