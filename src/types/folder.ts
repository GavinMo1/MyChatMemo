// src/types/folder.ts
// 文件夹类型定义

/** 文件夹（类似浏览器书签文件夹） */
export interface Folder {
  id: string;
  name: string;
  /** 父文件夹 ID，null 表示根级 */
  parentId: string | null;
  /** 排序序号 */
  order: number;
  createdAt: string;
  updatedAt: string;
}
