export enum AnalysisMode {
  Descriptive = 'Descriptive',
  Analytic = 'Analytic',
  Assistive = 'Assistive',
  Contextual = 'Contextual',
  ObjectDetection = 'Object Detection',
  HandGesture = 'Hand Gesture',
}

export enum LogType {
  Analysis = 'Analysis',
  Audio = 'Audio',
  System = 'System',
  Summary = 'Summary',
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