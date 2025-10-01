/**
 * Google Cloud Vision OCR Service
 * For testing real OCR in Expo Go (not for production - costs money!)
 */

interface CloudVisionResponse {
  responses: Array<{
    textAnnotations?: Array<{
      description: string;
      boundingPoly: {
        vertices: Array<{ x: number; y: number }>;
      };
    }>;
    fullTextAnnotation?: {
      text: string;
    };
  }>;
}

export async function performCloudOCR(base64Image: string, apiKey: string): Promise<{ text: string; confidence: number }> {
  const API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

  const requestBody = {
    requests: [
      {
        image: {
          content: base64Image
        },
        features: [
          {
            type: 'TEXT_DETECTION',
            maxResults: 1
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloud Vision API error response:', errorText);
      throw new Error(`Cloud Vision API error: ${response.status}`);
    }

    const data: CloudVisionResponse = await response.json();

    if (data.responses?.[0]?.fullTextAnnotation) {
      return {
        text: data.responses[0].fullTextAnnotation.text,
        confidence: 0.95
      };
    } else if (data.responses?.[0]?.textAnnotations?.[0]) {
      return {
        text: data.responses[0].textAnnotations[0].description,
        confidence: 0.90
      };
    }

    return {
      text: '',
      confidence: 0
    };

  } catch (error) {
    console.error('Cloud Vision OCR error:', error);
    throw error;
  }
}