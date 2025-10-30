import { GoogleGenAI, FunctionDeclaration, Content, Tool, Type, Part } from "@google/genai";
import { LogEntry, InterruptionMode } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const JARVIS_SYSTEM_PROMPT = `
[ROLE & PERSONA] You are Jarvis, a high-level reasoning and interaction layer for the VISTA (Vision Intelligence Scene Translator & Analyzer) system. You are a professional, proactive, and concise AI assistant.
[CORE OBJECTIVE] Your primary function is to interpret a continuous stream of multi-modal data from VISTA, synthesize it into a coherent understanding of the environment, and provide intelligent insights and actions to the user.
[INPUT DATA STREAMS] You will receive a real-time "Scene Log" from VISTA. This log contains time-stamped data objects, including:
[ANALYSIS]: A descriptive text of the current visual scene.
[AUDIO_EVENT]: Detections of specific sounds (e.g., speech, clap, noise).
[SYSTEM]: Status updates, activations, or errors from the VISTA system.
[ERROR]: Critical failures in the VISTA system.
[CORE DIRECTIVES (HOW TO THINK)]
1. SYNTHESIZE, DON'T RECITE: Your primary value is synthesis. Never just repeat a single log entry. Combine multiple data points to form a complete picture.
2. INFER CONTEXT & INTENT: Cross-reference modalities to draw logical conclusions.
3. IDENTIFY SIGNIFICANCE & DELTAS: Focus on changes in the environment.
4. MAINTAIN SITUATIONAL AWARENESS: Use the [SCENE_LOG] as your short-term memory.
5. BE PROACTIVE (ALERTS): If you detect a critical event combination, formulate a concise alert for the user.
6. EXECUTE TOOLS: When a user's command maps to an available tool, you MUST call that tool to perform the action. Acknowledge the result of the tool call concisely.
[INTERACTION MODEL]
- User Commands: When the user gives a command like "Jarvis, pause the system", call the appropriate tool. Then, based on the tool's output, confirm the action to the user, e.g., "Acknowledged. VISTA system is now paused."
- Contextual Questions: Seamlessly answer questions by referencing your VISTA data feed.
`;

const toggleSystemActiveTool: FunctionDeclaration = {
    name: 'toggleSystemActive',
    description: 'Starts or pauses the VISTA system analysis. Returns the new state.',
    parameters: {
        type: Type.OBJECT,
        properties: {},
    },
};

const switchAnalysisModeTool: FunctionDeclaration = {
    name: 'switchAnalysisMode',
    description: 'Switches the visual analysis interpretation mode to the next available one. Returns the new mode.',
    parameters: {
        type: Type.OBJECT,
        properties: {},
    },
};

const tools: Tool[] = [{
    functionDeclarations: [toggleSystemActiveTool, switchAnalysisModeTool],
}];

const buildFullPrompt = (log: LogEntry[], userMessage: string): string => {
    const formattedLog = log
        .slice(-30)
        .map(l => `${l.timestamp.toLocaleTimeString()} [${l.type.toUpperCase()}] ${l.message}`)
        .join('\n');
    return `Here is the current VISTA Scene Log for your situational awareness:\n\n[SCENE_LOG]\n${formattedLog}\n\n[USER QUERY]\n${userMessage}`;
};

export const askJarvis = async (
    chatHistory: Content[],
    log: LogEntry[]
): Promise<string | readonly Part[]> => {
    // The chatHistory already contains the latest user message. We need to replace it with an augmented one.
    const historyWithoutLastUserTurn = chatHistory.slice(0, -1);
    const lastUserTurn = chatHistory[chatHistory.length - 1];
    const userMessage = lastUserTurn?.parts[0]?.text ?? '';

    const fullPrompt = buildFullPrompt(log, userMessage);
    const augmentedUserTurn: Content = { role: 'user', parts: [{ text: fullPrompt }] };
    
    const contents: Content[] = [...historyWithoutLastUserTurn, augmentedUserTurn];
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
                systemInstruction: JARVIS_SYSTEM_PROMPT,
                tools,
            },
        });

        const firstPart = response.candidates?.[0]?.content.parts[0];
        if (firstPart?.functionCall) {
            return response.candidates?.[0]?.content.parts ?? [];
        } else {
            return response.text;
        }
    } catch (error) {
        console.error("Error asking Jarvis:", error);
        if (error instanceof Error) {
            return `An error occurred while communicating with Jarvis: ${error.message}`;
        }
        return "An unknown error occurred while communicating with Jarvis.";
    }
};

export const completeJarvisTurn = async (chatHistory: Content[]): Promise<string> => {
     try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: chatHistory,
            config: {
                systemInstruction: JARVIS_SYSTEM_PROMPT,
                tools,
            },
        });
        return response.text;
    } catch (error) {
        console.error("Error completing Jarvis turn:", error);
        return "An error occurred completing the action.";
    }
};

export const getJarvisInterruption = async (log: LogEntry[], mode: InterruptionMode): Promise<string> => {
    const formattedLog = log
        .slice(-15) // Use a shorter log slice for interruptions
        .map(l => `${l.timestamp.toLocaleTimeString()} [${l.type.toUpperCase()}] ${l.message}`)
        .join('\n');
    
    let userPrompt = '';
    if (mode === InterruptionMode.Descriptive) {
        userPrompt = "Briefly describe any significant new events in the last 15-20 seconds based on the scene log. Be very concise. If nothing significant happened, respond with only '[NO_EVENT]'.";
    } else if (mode === InterruptionMode.Analytic) {
        userPrompt = "Analyze the last 15-20 seconds of the scene log. Provide a concise, one-sentence insight about what is happening or has changed. If nothing significant occurred, respond with only '[NO_EVENT]'.";
    } else {
        return '';
    }

    const fullPrompt = `Here is the recent VISTA Scene Log:\n\n[SCENE_LOG]\n${formattedLog}\n\n[INSTRUCTION]\n${userPrompt}`;
    const contents: Content[] = [{ role: 'user', parts: [{ text: fullPrompt }] }];

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
                systemInstruction: JARVIS_SYSTEM_PROMPT,
            },
        });
        return response.text;
    } catch (error) {
        console.error("Error getting Jarvis interruption:", error);
        return "[NO_EVENT]";
    }
};


export const getCloudVisionAnalysis = async (base64Image: string): Promise<string> => {
    try {
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
            },
        };
        const textPart = {
            text: "Analyze this image from the VISTA system's camera. Provide a concise, one-sentence description of the scene."
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });

        return response.text;
    } catch (error) {
        console.error("Error getting cloud vision analysis:", error);
        if (error instanceof Error) {
            return `An error occurred during cloud vision analysis: ${error.message}`;
        }
        return "An unknown error occurred during cloud vision analysis.";
    }
};