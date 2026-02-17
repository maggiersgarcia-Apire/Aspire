import * as fflate from "fflate";
import * as XLSX from "xlsx";

interface FileData {
  mimeType: string;
  data: string; // base64
  name?: string;
}

// Helper to decode Base64 to Uint8Array for binary processing
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Helper to convert XLSX/CSV to text
const processSpreadsheet = (file: FileData): string => {
  try {
    const data = base64ToUint8Array(file.data);
    const workbook = XLSX.read(data, { type: 'array' });
    let fullText = `--- SPREADSHEET CONTENT (${file.name || 'Unknown File'}) ---\n`;
    
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      fullText += `[SHEET: ${sheetName}]\n${csv}\n\n`;
    });
    
    return fullText;
  } catch (e) {
    console.error("Spreadsheet parsing failed", e);
    return `[FAILED TO PARSE SPREADSHEET ${file.name}]`;
  }
};

// Helper to process DOCX (Unzip to find images and text)
const processDocx = async (file: FileData): Promise<{ text: string, images: FileData[] }> => {
  return new Promise((resolve) => {
    try {
      const data = base64ToUint8Array(file.data);
      const images: FileData[] = [];
      let extractedText = "";

      fflate.unzip(data, (err, unzipped) => {
        if (err) {
          console.error("DOCX Unzip failed", err);
          resolve({ text: "[DOCX PARSE ERROR]", images: [] });
          return;
        }

        // 1. Extract Images (word/media/)
        for (const path in unzipped) {
          if (path.startsWith('word/media/')) {
            const fileData = unzipped[path];
            // Determine extension
            const ext = path.split('.').pop()?.toLowerCase();
            let mime = 'image/jpeg';
            if (ext === 'png') mime = 'image/png';
            if (ext === 'gif') mime = 'image/gif';
            
            // Convert to base64
            let binary = '';
            for (let i = 0; i < fileData.length; i++) {
                binary += String.fromCharCode(fileData[i]);
            }
            const base64 = btoa(binary);
            
            images.push({
              mimeType: mime,
              data: base64,
              name: `Embedded Image from ${file.name}`
            });
          }
        }

        // 2. Extract Text (word/document.xml) - Very basic extraction
        if (unzipped['word/document.xml']) {
           const xmlData = unzipped['word/document.xml'];
           let xmlString = '';
           for (let i = 0; i < xmlData.length; i++) {
               xmlString += String.fromCharCode(xmlData[i]);
           }
           // Simple regex to strip XML tags and get text
           const text = xmlString.replace(/<[^>]+>/g, ' ');
           extractedText = `--- DOCX TEXT CONTENT (${file.name}) ---\n${text}`;
        }

        resolve({ text: extractedText, images });
      });
    } catch (e) {
      console.error("DOCX Processing failed", e);
      resolve({ text: "[DOCX PROCESSING ERROR]", images: [] });
    }
  });
};

export const analyzeReimbursement = async (
  receiptImages: FileData[],
  formImage: FileData | null
) => {
  
  const parts = [];

  // --- PRE-PROCESSING & NORMALIZATION ---
  const processedReceipts = [];
  
  // Helper to check if file is a "document" we need to parse manually
  const isDoc = (mime: string) => mime.includes('word') || mime.includes('officedocument') || mime.includes('csv') || mime.includes('excel') || mime.includes('spreadsheet');

  // 1. Process Receipts Input
  for (const file of receiptImages) {
      if (isDoc(file.mimeType)) {
          // If it's a spreadsheet
          if (file.mimeType.includes('sheet') || file.mimeType.includes('excel') || file.mimeType.includes('csv')) {
              const textContent = processSpreadsheet(file);
              parts.push({ text: textContent });
          }
          // If it's a Word Doc
          else if (file.mimeType.includes('word') || file.mimeType.includes('doc')) {
              const { text, images } = await processDocx(file);
              if (text) parts.push({ text });
              if (images.length > 0) {
                  parts.push({ text: `[Images extracted from ${file.name || 'DOCX'}]`});
                  images.forEach(img => processedReceipts.push(img));
              }
          }
      } else {
          // Standard Image/PDF
          processedReceipts.push(file);
      }
  }

  // 2. Process Form Input
  if (formImage) {
      if (isDoc(formImage.mimeType)) {
          if (formImage.mimeType.includes('sheet') || formImage.mimeType.includes('excel') || formImage.mimeType.includes('csv')) {
              const textContent = processSpreadsheet(formImage);
              parts.push({ text: "Here is the content of the Reimbursement Form (Spreadsheet):" });
              parts.push({ text: textContent });
          }
          else if (formImage.mimeType.includes('word') || formImage.mimeType.includes('doc')) {
              const { text, images } = await processDocx(formImage);
              parts.push({ text: "Here is the content of the Reimbursement Form (Word Doc):" });
              if (text) parts.push({ text });
              if (images.length > 0) {
                  parts.push({ text: "[Images attached to form]" });
                   images.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }));
              }
          }
      } else {
          parts.push({ text: "Here is the Reimbursement Form Image:" });
          parts.push({
            inlineData: {
              mimeType: formImage.mimeType,
              data: formImage.data,
            },
          });
      }
  } else {
      parts.push({ text: "[NO FORM IMAGE PROVIDED - Please extract info from receipts or assume hypothetical form data if needed for example]" });
  }

  // Add Processed Receipt Images (Original Images + Extracted Images)
  if (processedReceipts.length > 0) {
    parts.push({ text: "Here are the Receipt Images:" });
    processedReceipts.forEach((img) => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data,
        },
      });
    });
  } else if (receiptImages.length > 0 && processedReceipts.length === 0) {
     // If we had input files but they were all documents with no images extracted
     parts.push({ text: "[NOTE: Documents were provided but no direct images were found. Please analyze the extracted text above.]" });
  } else {
    parts.push({ text: "[NO RECEIPT IMAGES PROVIDED]" });
  }

  try {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parts }),
    });

    if (!response.ok) {
        // Handle non-JSON errors (like 404 HTML pages from Vercel)
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
             const errorData = await response.json();
             throw new Error(errorData.error || "Failed to process audit");
        } else {
             const text = await response.text();
             console.error("Non-JSON API Response:", text);
             throw new Error(`Server Error (${response.status}): The API endpoint was not found or returned an invalid response.`);
        }
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("Audit Service Error:", error);
    throw error;
  }
};