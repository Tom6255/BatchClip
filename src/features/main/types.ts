// EN: Shared core types for the main editor workflow.
// ZH: 主编辑流程共享的核心类型定义。
export interface Segment {
  id: string;
  start: number;
  end: number;
  tags: string[];
}

export interface QueueVideoItem {
  id: string;
  file: File;
  filePath: string;
  displayName: string;
  segments: Segment[];
  uniqueKey: string;
}
