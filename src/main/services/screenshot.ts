/**
 * Screenshot capture service for TradingView charts
 * Captures, optimizes, and saves screenshots for Claude API analysis
 */

import { app, NativeImage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getTradingViewView } from '../window';
import { DatabaseService } from './database';

// Claude API image size constraints
const MAX_DIMENSION = 1568; // Maximum width/height for Claude API
const SCREENSHOT_DIR = 'screenshots';

export interface CaptureScreenshotOptions {
  /**
   * Optional trade ID to link screenshot to
   */
  tradeId?: string;

  /**
   * Optional message ID to link screenshot to
   */
  messageId?: string;
}

export interface CaptureScreenshotResult {
  /**
   * Unique ID of the screenshot record in database
   */
  id: string;

  /**
   * Absolute path to the saved screenshot file
   */
  filePath: string;

  /**
   * Width of the saved image
   */
  width: number;

  /**
   * Height of the saved image
   */
  height: number;

  /**
   * File size in bytes
   */
  fileSize: number;
}

/**
 * ScreenshotService handles capturing and optimizing screenshots
 * of the TradingView chart pane
 */
export class ScreenshotService {
  private screenshotDir: string;
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
    this.screenshotDir = path.join(app.getPath('userData'), SCREENSHOT_DIR);
    this.ensureScreenshotDir();
  }

  /**
   * Ensure the screenshots directory exists
   */
  private ensureScreenshotDir(): void {
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  /**
   * Capture a screenshot of the TradingView pane
   * @returns Screenshot metadata and file path
   * @throws Error if TradingView view is not available or capture fails
   */
  async captureScreenshot(options: CaptureScreenshotOptions = {}): Promise<CaptureScreenshotResult> {
    // Get TradingView view
    const tvView = getTradingViewView();
    if (!tvView) {
      throw new Error('TradingView view not available');
    }

    try {
      // Capture screenshot from WebContentsView
      const image = await tvView.webContents.capturePage();

      // Optimize image for Claude API
      const optimizedImage = this.optimizeImage(image);

      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const filename = `screenshot-${timestamp}.png`;
      const filePath = path.join(this.screenshotDir, filename);

      // Save to disk
      const pngBuffer = optimizedImage.toPNG();
      fs.writeFileSync(filePath, pngBuffer);

      // Get image dimensions
      const size = optimizedImage.getSize();
      const fileSize = pngBuffer.length;

      // Save metadata to database
      const id = await this.db.createScreenshot({
        filePath,
        width: size.width,
        height: size.height,
        fileSize,
        tradeId: options.tradeId,
        messageId: options.messageId,
      });

      return {
        id,
        filePath,
        width: size.width,
        height: size.height,
        fileSize,
      };
    } catch (error) {
      console.error('[Screenshot] Failed to capture screenshot:', error);
      throw new Error('Failed to capture screenshot', { cause: error });
    }
  }

  /**
   * Optimize image for Claude API
   * - Resize to fit within MAX_DIMENSION x MAX_DIMENSION
   * - Convert to PNG format
   * - Maintain aspect ratio
   * @param image - The original captured image
   * @returns Optimized NativeImage
   */
  private optimizeImage(image: NativeImage): NativeImage {
    const size = image.getSize();
    const { width, height } = size;

    // Check if resizing is needed
    if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
      // No resize needed, return original
      return image;
    }

    // Calculate new dimensions maintaining aspect ratio
    let newWidth: number;
    let newHeight: number;

    if (width > height) {
      // Width is the limiting dimension
      newWidth = MAX_DIMENSION;
      newHeight = Math.round((height / width) * MAX_DIMENSION);
    } else {
      // Height is the limiting dimension
      newHeight = MAX_DIMENSION;
      newWidth = Math.round((width / height) * MAX_DIMENSION);
    }

    // Resize the image
    return image.resize({
      width: newWidth,
      height: newHeight,
      quality: 'best',
    });
  }

  /**
   * Get screenshot metadata from database
   * @param id - Screenshot ID
   * @returns Screenshot metadata or undefined if not found
   */
  async getScreenshot(id: string): Promise<{
    id: string;
    filePath: string;
    width: number;
    height: number;
    fileSize: number;
    tradeId?: string;
    messageId?: string;
    createdAt: Date;
  } | undefined> {
    return this.db.getScreenshot(id);
  }

  /**
   * List screenshots with optional filters
   * @param options - Filter options
   * @returns Array of screenshot metadata
   */
  async listScreenshots(options: {
    tradeId?: string;
    messageId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Array<{
    id: string;
    filePath: string;
    width: number;
    height: number;
    fileSize: number;
    tradeId?: string;
    messageId?: string;
    createdAt: Date;
  }>> {
    return this.db.listScreenshots(options);
  }

  /**
   * Delete a screenshot (removes file and database record)
   * @param id - Screenshot ID
   */
  async deleteScreenshot(id: string): Promise<void> {
    const screenshot = await this.db.getScreenshot(id);
    if (!screenshot) {
      throw new Error(`Screenshot not found: ${id}`);
    }

    // Delete file if it exists
    if (fs.existsSync(screenshot.filePath)) {
      fs.unlinkSync(screenshot.filePath);
    }

    // Delete database record
    await this.db.deleteScreenshot(id);
  }

  /**
   * Read screenshot file as base64-encoded data URL
   * Useful for embedding in HTML or sending to Claude API
   * @param id - Screenshot ID
   * @returns base64-encoded data URL (data:image/png;base64,...)
   */
  async getScreenshotDataUrl(id: string): Promise<string> {
    const screenshot = await this.db.getScreenshot(id);
    if (!screenshot) {
      throw new Error(`Screenshot not found: ${id}`);
    }

    if (!fs.existsSync(screenshot.filePath)) {
      throw new Error(`Screenshot file not found: ${screenshot.filePath}`);
    }

    const buffer = fs.readFileSync(screenshot.filePath);
    const base64 = buffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  }

  /**
   * Get screenshot as Buffer (for Claude API)
   * @param id - Screenshot ID
   * @returns Image buffer
   */
  async getScreenshotBuffer(id: string): Promise<Buffer> {
    const screenshot = await this.db.getScreenshot(id);
    if (!screenshot) {
      throw new Error(`Screenshot not found: ${id}`);
    }

    if (!fs.existsSync(screenshot.filePath)) {
      throw new Error(`Screenshot file not found: ${screenshot.filePath}`);
    }

    return fs.readFileSync(screenshot.filePath);
  }
}
