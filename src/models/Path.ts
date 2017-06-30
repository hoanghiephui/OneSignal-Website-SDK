import { InvalidArgumentError, InvalidArgumentReason } from '../errors/InvalidArgumentError';

/**
 * Represents a normalized path.
 *
 * Paths are downcased and spaces are trimmed.
 * Paths without file names will never contain trailing slashes, except for empty paths.
 */
export default class Path {

  private path: string;

  constructor(path: string) {
    if (!path) {
      throw new InvalidArgumentError('path', InvalidArgumentReason.Empty);
    }
    this.path = path.trim();
  }

  getFileName(): string {
    return this.path.split('\\').pop().split('/').pop();
  }

  getFullPath() {
    return this.path;
  }

  getPathWithoutFileName() {
    const fileNameIndex = this.path.lastIndexOf(this.getFileName());
    let pathWithoutFileName = this.path.substring(0, fileNameIndex);
    pathWithoutFileName = pathWithoutFileName.replace(/[\\\/]$/, '');
    return pathWithoutFileName;
  }
}
