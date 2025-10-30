export enum AnalysisMode {
  ObjectDetection = 'Object Detection',
  HandGesture = 'Hand Gesture',
}

export enum LogType {
  Analysis = 'Analysis',
  Audio = 'Audio',
  System = 'System',
  Error = 'Error',
  Gesture = 'Gesture',
}

export interface LogEntry {
  id: number;
  timestamp: Date;
  type: LogType;
  message: string;
  mode?: AnalysisMode;
}
