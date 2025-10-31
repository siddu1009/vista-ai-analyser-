export enum AnalysisMode {
  ObjectDetection = 'Object Detection',
  HandGesture = 'Hand Gesture',
  CloudVision = 'Cloud Vision',
  ContextualQnA = 'Contextual Q&A',
}

export enum LogType {
  Analysis = 'Analysis',
  Audio = 'Audio',
  System = 'System',
  Error = 'Error',
  Gesture = 'Gesture',
  Interruption = 'Interruption',
}

export enum NarrationMode {
  Off = 'Off',
  AlertsOnly = 'Alerts Only',
  Full = 'Full',
}

export enum InterruptionMode {
  Off = 'Off',
  Descriptive = 'Descriptive',
  Analytic = 'Analytic',
}

export enum VoiceActivationMode {
  Off = 'Off',
  WakeWord = 'Wake Word',
}

export interface LogEntry {
  id: number;
  timestamp: Date;
  type: LogType;
  message: string;
  mode?: AnalysisMode;
}