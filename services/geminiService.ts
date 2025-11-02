import type { VistaContext } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const askJarvis = async (prompt: string, context: VistaContext): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: prompt, context }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const getCloudVisionAnalysis = async (base64Image: string): Promise<{ scene_description: string; visible_text: {text: string, location: string}[] }> => {
  const response = await fetch(`${API_BASE_URL}/api/vision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageData: base64Image }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// This function will now be handled by the backend or removed if not needed.
export const getJarvisInterruption = async (context: VistaContext): Promise<string | null> => {
  // For now, we'll return null. This functionality needs to be moved to the backend.
  console.warn("getJarvisInterruption is not yet implemented on the backend.");
  return null;
};