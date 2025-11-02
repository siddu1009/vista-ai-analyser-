
export enum AnalysisMode {
  ObjectDetection = "Object Detection",
  HandGesture = "Hand Gesture",
  ContextualQA = "Contextual Q&A",
}

export enum VoiceStatus {
  Idle = "idle",
  ListeningWakeWord = "listening for wake word",
  WaitingForCommand = "waiting for command",
  Processing = "processing",
  Speaking = "speaking",
}

export enum LogType {
  Info = "INFO",
  Success = "SUCCESS",
  Warning = "WARNING",
  Error = "ERROR",
  Command = "COMMAND",
  Response = "RESPONSE",
  Audio = "AUDIO",
}

export interface LogEntry {
  id: number;
  timestamp: string;
  type: LogType;
  message: string;
}

export interface ChatMessage {
  id: number;
  sender: 'user' | 'jarvis';
  text: string;
}

export interface VistaContext {
  scene_description: string;
  visible_text: { text: string; location: string }[];
  entities_in_view: { id: string; name: string; type: string }[];
  audio_context: string;
}

export interface SmartHomeEntity {
  id: string;
  name: string;
  type: 'light' | 'thermostat' | 'media_player';
  aliases: string[];
  state: 'on' | 'off';
}
