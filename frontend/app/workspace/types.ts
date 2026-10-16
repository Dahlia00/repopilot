import type { Finding } from '../review-findings';
import type {StaticFinding, ScannerReport, CombinedSummary} from '../static-analysis';
import type {ContextFileMetadata, SkippedFileMetadata} from '../repository-context';
export type ChangedFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
};
export type Analysis = {
  head_sha: string;
  head_repository: string;
  repository: string;
  pull_request: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  base_branch: string;
  head_branch: string;
  changed_files: number;
  additions: number;
  deletions: number;
  files: ChangedFile[];
  files_truncated: boolean;
};
export type Review = Analysis & {
  findings: Finding[];
  ai_findings: (Finding & { source: 'AI' })[];
  static_findings: StaticFinding[];
  scanners: ScannerReport[];
  static_skipped_files: SkippedFileMetadata[];
  summary: CombinedSummary;
  reviewed_files: string[];
  skipped_files: string[];
  model: string;
  repository_context: ContextFileMetadata[];
  context_warnings: string[];
  skipped_file_details: SkippedFileMetadata[];
  head_sha: string;
  head_repository: string;
};

export type SectionId = 'overview' | 'files' | 'findings' | 'static' | 'security' | 'agents' | 'tests' | 'fixes' | 'verification' | 'context';
