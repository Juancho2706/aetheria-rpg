/**
 * Converts raw PCM data (base64) to a WAV blob URL that browsers can play.
 * Gemini 2.5 Flash TTS returns: audio/L16;rate=24000
 */
export function pcmToWav(base64Pcm: string): string {
    // 1. Decode base64 to binary string
    const binaryString = window.atob(base64Pcm);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // 2. Create WAV Header
    // Specs from Gemini API: 24000Hz, 16-bit, Mono (1 channel)
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;

    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + bytes.length, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, numChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    /* bits per sample */
    view.setUint16(34, bitsPerSample, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, bytes.length, true);

    // 3. Combine Header + Data
    const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
