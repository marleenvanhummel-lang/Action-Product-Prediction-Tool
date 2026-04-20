export interface CopyIssue {
  category: string
  description: string
  severity: 'error' | 'warning'
}

export interface CopyCheckResult {
  status: 'pass' | 'fail' | 'warning'
  issues: CopyIssue[]
  suggestions: string[]
  rewrittenOptions: string[]
  summary: string
}

export interface ExtractedCopy {
  draftName: string
  copyText: string
}

export interface BulkCopyResult {
  draftName: string
  copyText: string
  result: CopyCheckResult
  error?: string
}
