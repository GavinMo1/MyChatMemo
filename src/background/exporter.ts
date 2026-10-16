// src/background/exporter.ts
// Markdown / ZIP 导出模块

import JSZip from 'jszip';
import type { Folder, Message, Platform } from '@/types';
import { PLATFORM_LABELS } from '@/shared/constants';

interface ExportableConversation {
  id: string;
  title: string;
  platform: Platform;
  url: string;
  updatedAt: string;
  folderId: string | null;
  messages: Pick<Message, 'sender' | 'content' | 'thinking'>[];
}

export interface ExportedMarkdownFile {
  filename: string;
  content: string;
}

export interface ExportedZipFile {
  filename: string;
  buffer: ArrayBuffer;
}

export interface ExportZipOptions {
  flatten?: boolean;
}

/**
 * 将对话导出为 Markdown 格式文本
 */
export function exportToMarkdown(conv: ExportableConversation): string {
  const lines: string[] = [
    `# ${conv.title}`,
    '',
    `- **平台**: ${PLATFORM_LABELS[conv.platform] ?? conv.platform}`,
    `- **链接**: ${conv.url}`,
    `- **保存时间**: ${new Date(conv.updatedAt).toLocaleString('zh-CN')}`,
    '',
    '---',
    '',
  ];

  for (const msg of conv.messages) {
    const role = msg.sender === 'user' ? '👤 用户' : '🤖 AI';
    lines.push(`## ${role}`);
    lines.push('');
    if (msg.thinking) {
      lines.push('<details>');
      lines.push('<summary>💭 思考过程</summary>');
      lines.push('');
      lines.push(msg.thinking);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
    lines.push(msg.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function exportConversationFile(conv: ExportableConversation): ExportedMarkdownFile {
  return {
    filename: createMarkdownFilename(conv),
    content: exportToMarkdown(conv),
  };
}

export async function exportConversationsToZip(
  conversations: ExportableConversation[],
  folders: Folder[],
  options: ExportZipOptions = {}
): Promise<ExportedZipFile> {
  const zip = new JSZip();
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const usedPaths = new Set<string>();

  for (const conversation of conversations) {
    const exported = exportConversationFile(conversation);
    const entryPath = buildZipEntryPath(conversation, folderMap, options);
    zip.file(createUniqueZipEntryPath(entryPath, usedPaths), exported.content);
  }

  return {
    filename: `MyChatMemo_Export_${formatTimestamp(new Date().toISOString())}.zip`,
    buffer: await zip.generateAsync({ type: 'arraybuffer' }),
  };
}

export function createMarkdownFilename(
  conv: Pick<ExportableConversation, 'title' | 'updatedAt'>
): string {
  const safeTitle = sanitizePathSegment(conv.title || '无标题');
  return `${formatTimestamp(conv.updatedAt)}_${safeTitle}.md`;
}

export function buildZipEntryPath(
  conv: Pick<ExportableConversation, 'platform' | 'folderId' | 'title' | 'updatedAt'>,
  folderMap: Map<string, Folder>,
  options: ExportZipOptions = {}
): string {
  if (options.flatten) {
    return createMarkdownFilename(conv);
  }

  const platform = sanitizePathSegment(PLATFORM_LABELS[conv.platform] ?? conv.platform);
  const folderPath = buildFolderPath(conv.folderId, folderMap);
  return `${platform}/${folderPath}/${createMarkdownFilename(conv)}`;
}

export function createUniqueZipEntryPath(entryPath: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(entryPath)) {
    usedPaths.add(entryPath);
    return entryPath;
  }

  const extensionIndex = entryPath.lastIndexOf('.');
  const hasExtension = extensionIndex > -1;
  const baseName = hasExtension ? entryPath.slice(0, extensionIndex) : entryPath;
  const extension = hasExtension ? entryPath.slice(extensionIndex) : '';

  let suffix = 2;
  let candidate = `${baseName} (${suffix})${extension}`;
  while (usedPaths.has(candidate)) {
    suffix += 1;
    candidate = `${baseName} (${suffix})${extension}`;
  }

  usedPaths.add(candidate);
  return candidate;
}

export function buildFolderPath(folderId: string | null, folderMap: Map<string, Folder>): string {
  if (!folderId) return '未分类';

  const segments: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = folderId;

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const folder = folderMap.get(currentId);
    if (!folder) break;
    segments.unshift(sanitizePathSegment(folder.name || '未命名文件夹'));
    currentId = folder.parentId;
  }

  return segments.length > 0 ? segments.join('/') : '未分类';
}

// Conservative limit for nested paths to avoid filesystem issues
const MAX_FILENAME_SEGMENT_LENGTH = 80;

export function sanitizePathSegment(input: string): string {
  const sanitized = input
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized.slice(0, MAX_FILENAME_SEGMENT_LENGTH) || 'untitled';
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}
