import { GoogleGenAI } from "@google/genai";
import { AnalysisMode } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getPromptForMode = (mode: AnalysisMode): string => {
  switch (mode) {
    case AnalysisMode.Descriptive:
      return "Describe the scene in this image concisely. What is happening?";
    case AnalysisMode.Analytic:
      return "Analyze this scene in detail. What are the key objects, their relationships, and any potential actions or events taking place? Provide a structured breakdown.";
    case AnalysisMode.Assistive:
      return "Provide a detailed audio description of this image for someone who is visually impaired. Focus on spatial relationships, objects, people, and potential sounds.";
    case AnalysisMode.Contextual:
      return "Based on this image, infer the context. What is the likely location (e.g., office, park), time of day, and overall atmosphere?";
    case AnalysisMode.ObjectDetection:
        return "Identify and list all the distinct objects you can see in this image. Provide a simple, comma-separated list of the objects.";
    case AnalysisMode.HandGesture:
        return "Analyze the hand gesture in the image and describe its possible meaning.";
    default:
      return "Describe this image.";
  }
};

export const analyzeScene = async (base64Image: string, mode: AnalysisMode): Promise<string> => {
  try {
    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Image,
      },
    };
    const textPart = {
      text: getPromptForMode(mode)
    };
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
    });

    return response.text;
  } catch (error) {
    console.error("Error analyzing scene:", error);
    return "An error occurred during AI analysis.";
  }
};

export const summarizeLog = async (logText: string): Promise<string> => {
  try {
    const prompt = `The following is a timestamped log of events from a scene analysis. Provide a concise, bulleted summary of the key events and observations. Log:\n\n${logText}`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    return response.text;
  } catch (error) {
    console.error("Error summarizing log:", error);
    return "An error occurred during summarization.";
  }
};