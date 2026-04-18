export type GitStatusCode = 'M' | 'A' | 'D' | 'R' | 'C' | '?' | '!'

export interface GitFileStatus {
  path: string
  statusCode: GitStatusCode
}

export interface GitBranch {
  name: string
  isCurrent: boolean
}

export interface GitDirInfo {
  /** 相对于项目目录的路径 */
  path: string
  /** 当前分支 */
  branch: string
}

export interface GitStatusResponse {
  isGitRepo: boolean
  branch?: string
  branches: GitBranch[]
  hasRemote?: boolean
  staged: GitFileStatus[]
  unstaged: GitFileStatus[]
  untracked: GitFileStatus[]
}

export interface GitScanResponse {
  gitDirs: GitDirInfo[]
}
