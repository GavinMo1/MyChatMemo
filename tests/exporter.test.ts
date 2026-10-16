import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  buildFolderPath,
  buildZipEntryPath,
  createUniqueZipEntryPath,
  createMarkdownFilename,
  exportConversationFile,
  exportConversationsToZip,
} from '@/background/exporter';
import type { Folder } from '@/types';

const folders: Folder[] = [
  {
    id: 'folder_parent',
    name: '项目归档',
    parentId: null,
    order: 0,
    createdAt: '2026-03-26T08:00:00.000Z',
    updatedAt: '2026-03-26T08:00:00.000Z',
  },
  {
    id: 'folder_child',
    name: '阶段一',
    parentId: 'folder_parent',
    order: 1,
    createdAt: '2026-03-26T08:00:00.000Z',
    updatedAt: '2026-03-26T08:00:00.000Z',
  },
];

describe('exporter helpers', () => {
  it('builds single markdown filename with timestamp and sanitized title', () => {
    const filename = createMarkdownFilename({
      title: '需求评审: 第一版/草稿',
      updatedAt: '2026-03-26T08:09:10',
    });

    expect(filename).toBe('20260326_080910_需求评审 第一版 草稿.md');
  });

  it('resolves nested folder path for zip entries', () => {
    const folderMap = new Map(folders.map(folder => [folder.id, folder]));
    expect(buildFolderPath('folder_child', folderMap)).toBe('项目归档/阶段一');
    expect(buildFolderPath(null, folderMap)).toBe('未分类');
  });

  it('adds a suffix when zip entry paths collide', () => {
    const usedPaths = new Set<string>();

    expect(createUniqueZipEntryPath('20260326_080910_迭代计划.md', usedPaths))
      .toBe('20260326_080910_迭代计划.md');
    expect(createUniqueZipEntryPath('20260326_080910_迭代计划.md', usedPaths))
      .toBe('20260326_080910_迭代计划 (2).md');
  });

  it('exports markdown and zip entries with platform/folder structure', async () => {
    const exported = exportConversationFile({
      id: 'conv_1',
      title: '迭代计划',
      platform: 'chatgpt',
      url: 'https://chatgpt.com/c/conv_1',
      updatedAt: '2026-03-26T08:09:10',
      folderId: 'folder_child',
      messages: [
        { sender: 'user', content: '帮我整理一下计划', thinking: undefined },
        { sender: 'assistant', content: '这里是整理后的计划', thinking: '先分析需求' },
      ],
    });

    expect(exported.filename).toBe('20260326_080910_迭代计划.md');
    expect(exported.content).toContain('# 迭代计划');
    expect(exported.content).toContain('💭 思考过程');

    const folderMap = new Map(folders.map(folder => [folder.id, folder]));
    expect(buildZipEntryPath({
      platform: 'chatgpt',
      folderId: 'folder_child',
      title: '迭代计划',
      updatedAt: '2026-03-26T08:09:10',
    }, folderMap)).toBe('ChatGPT/项目归档/阶段一/20260326_080910_迭代计划.md');

    const zipFile = await exportConversationsToZip([
      {
        id: 'conv_1',
        title: '迭代计划',
        platform: 'chatgpt',
        url: 'https://chatgpt.com/c/conv_1',
        updatedAt: '2026-03-26T08:09:10',
        folderId: 'folder_child',
        messages: [{ sender: 'user', content: '计划内容', thinking: undefined }],
      },
      {
        id: 'conv_2',
        title: '未分类记录',
        platform: 'gemini',
        url: 'https://gemini.google.com/app/conv_2',
        updatedAt: '2026-03-26T10:11:12',
        folderId: null,
        messages: [{ sender: 'assistant', content: '总结内容', thinking: undefined }],
      },
    ], folders);

    const archive = await JSZip.loadAsync(zipFile.buffer);
    const entryNames = Object.keys(archive.files).filter(name => !archive.files[name].dir);

    expect(entryNames).toContain('ChatGPT/项目归档/阶段一/20260326_080910_迭代计划.md');
    expect(entryNames).toContain('Gemini/未分类/20260326_101112_未分类记录.md');
    expect(entryNames).toHaveLength(2);
  });

  it('supports flattening all markdown files into the zip root', async () => {
    const zipFile = await exportConversationsToZip([
      {
        id: 'conv_1',
        title: '同名记录',
        platform: 'chatgpt',
        url: 'https://chatgpt.com/c/conv_1',
        updatedAt: '2026-03-26T08:09:10',
        folderId: 'folder_child',
        messages: [{ sender: 'user', content: '计划内容', thinking: undefined }],
      },
      {
        id: 'conv_2',
        title: '同名记录',
        platform: 'gemini',
        url: 'https://gemini.google.com/app/conv_2',
        updatedAt: '2026-03-26T08:09:10',
        folderId: null,
        messages: [{ sender: 'assistant', content: '总结内容', thinking: undefined }],
      },
    ], folders, { flatten: true });

    const archive = await JSZip.loadAsync(zipFile.buffer);
    const entryNames = Object.keys(archive.files).filter(name => !archive.files[name].dir);

    expect(entryNames).toContain('20260326_080910_同名记录.md');
    expect(entryNames).toContain('20260326_080910_同名记录 (2).md');
    expect(entryNames).toHaveLength(2);
  });
});
