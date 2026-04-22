import { ChatMessage } from '@/types';

export async function convertImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert image to base64'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

export function validateImageFile(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!validTypes.includes(file.type)) {
    alert('Please upload a valid image file (JPEG, PNG, GIF, or WebP)');
    return false;
  }

  if (file.size > maxSize) {
    alert('Image size must be less than 10MB');
    return false;
  }

  return true;
}

export async function convertImagesToBase64(files: File[]): Promise<string[]> {
  return Promise.all(files.map((file) => convertImageToBase64(file)));
}

export function getMessageImageUrls(
  message: Pick<ChatMessage, 'imageUrl' | 'imageUrls'>
): string[] {
  const imageUrls = Array.isArray(message.imageUrls)
    ? message.imageUrls.filter((url) => typeof url === 'string' && url.trim().length > 0)
    : [];

  if (imageUrls.length > 0) {
    return imageUrls;
  }

  if (typeof message.imageUrl === 'string' && message.imageUrl.trim().length > 0) {
    return [message.imageUrl];
  }

  return [];
}
