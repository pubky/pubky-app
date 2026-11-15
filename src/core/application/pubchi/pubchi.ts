import { PubkyAppTag } from 'pubky-app-specs';
import { TagKind } from '@/application/tag/tag.types';
import { AppError } from '@/libs/error/error';
import {
  AuthErrorCode,
  ClientErrorCode,
  DatabaseErrorCode,
  NetworkErrorCode,
  ServerErrorCode,
  TimeoutErrorCode,
  ValidationErrorCode,
} from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { getPubchiAudience } from '@/libs/pubchi/audience';
import { mintBotKey, phraseToBot } from '@/libs/pubchi/bot-key-custody';
import { capabilitiesCoverPubchiWrite, PUBCHI_PRIVATE_DIRECTORY, sessionCovers } from '@/libs/pubchi/capabilities';
import {
  deleteDeviceKey,
  DEVICE_DELEGATION_MAX_SECONDS,
  DEVICE_DELEGATION_REFRESH_SECONDS,
  getCurrentDeviceKey,
  getDeviceKeys,
  listDeviceKeysNotOwnedBy,
  loadOrGenerateDeviceKey,
  updateDeviceKeyExpiry,
} from '@/libs/pubchi/device-key';
import {
  canPublishDraftPost,
  canRejectDraftPost,
  DRAFT_POST_RECEIPT_MAX_BYTES,
  draftPostBinding,
  truncateDraftPostReceiptContent,
} from '@/libs/pubchi/draft-post';
import { extractPubchiErrorCode, pubchiValidationError } from '@/libs/pubchi/errors';
import { listPubchiFeedProvenance, recordPubchiBuiltFeed } from '@/libs/pubchi/feed-provenance';
import { isPubchiEnabled, isPubchiPanelEnabled, pubchiEndpointFor } from '@/libs/pubchi/flags';
import { PUBCHI_QUESTION_MAX_LENGTH } from '@/libs/pubchi/limits';
import {
  parsePendingEntry,
  type PendingDelegationDelete,
  readPendingDelegationDeletes,
  rememberPendingDelegationDeletes,
  rememberPendingDelegationDeletesPreservingOwner,
  replacePendingDelegationDeletesForOwner,
} from '@/libs/pubchi/pending-delegation-deletes';
import {
  buildExportBundle,
  hashDocumentBody,
  importWriteOrder,
  isHistoryPath,
  parseExportBundle,
  pathFromOwnedUrl,
  planImport,
  publicListDirectories,
  reconstructFeedsFromBundle,
} from '@/libs/pubchi/portability';
import {
  claimProactiveDay,
  decideProactiveAsk,
  hasProactiveDayClaim,
  isAppForeground,
  PROACTIVE_PURPOSE,
  PROACTIVE_QUESTION,
  proactiveFromConfig,
  proactiveSuggestionId,
  readAttemptState,
  recordProactiveAttempt,
  visibleProactiveSuggestions,
  withProactiveDayLock,
} from '@/libs/pubchi/proactive';
import { parsePubchiAnswerV1, type PubchiAnswerV1 } from '@/libs/pubchi/schemas/answer';
import { parseConversation } from '@/libs/pubchi/schemas/ask-body';
import { parsePubchiBotV1, type PubchiBotV1 } from '@/libs/pubchi/schemas/bot';
import { bodySha256 } from '@/libs/pubchi/schemas/canonical';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import {
  DEFAULT_SEND_PUBLIC_WEB_CONTEXT,
  parsePubchiConfigV1,
  type PubchiConfigV1,
} from '@/libs/pubchi/schemas/config';
import { contextForRequest, parsePubchiOwnerContextV1, type PubchiOwnerContextV1 } from '@/libs/pubchi/schemas/context';
import {
  delegationUri,
  type DeviceDelegationV1,
  parseDeviceDelegationV1,
  signDeviceDelegationV1,
  type UnsignedDeviceDelegationV1,
} from '@/libs/pubchi/schemas/delegation';
import { parsePubchiDocumentText, validatePubchiDocumentSize } from '@/libs/pubchi/schemas/document';
import { parsePubchiDraftPostReceipt } from '@/libs/pubchi/schemas/draft-post';
import { parseFeedProposal } from '@/libs/pubchi/schemas/feed';
import { scanForbiddenPublicState, validatePublicRootReferences } from '@/libs/pubchi/schemas/forbidden';
import {
  botUri,
  isAllowlistedPath,
  ownerBindingsUri,
  ownerBindingUri,
  suggestionPath,
} from '@/libs/pubchi/schemas/paths';
import { isPubkyId } from '@/libs/pubchi/schemas/pubky';
import { parseQueryResultV1 } from '@/libs/pubchi/schemas/query';
import { REQUEST_TTL_SECONDS, signRequestObjectV2, type UnsignedRequestObjectV2 } from '@/libs/pubchi/schemas/request';
import { projectTargetSnapshot } from '@/libs/pubchi/schemas/snapshot';
import {
  parsePubchiSuggestionV1,
  type PubchiSuggestionV1,
  suggestionFromAnswer,
} from '@/libs/pubchi/schemas/suggestion';
import { parsePubchiTagApplication, type PubchiTagApplication } from '@/libs/pubchi/schemas/tag-application';
import { type OwnerBindingV1, parseOwnerBindingV1 } from '@/libs/pubchi/schemas/tenant';
import { canApplyTagSuggestion, tagApplicationBinding } from '@/libs/pubchi/tag-application';
import { bindingRecordId } from '@/models/pubchi/binding.schema';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { retryHomeserverWriteAfterReread } from '@/services/homeserver/write-retry';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { LocalPubchiRecordService } from '@/services/local/pubchi/records';
import { PubchiService } from '@/services/pubchi/pubchi';
import type {
  ConfirmPubchiBackupParams,
  CreatedPubchi,
  CreatePubchiParams,
  DiscoveredTagSuggestion,
  LoadedPubchi,
  PubchiAskBody,
  PubchiBindingRecordResult,
  PubchiBindingWriteParams,
  PubchiExportParams,
  PubchiImportPreview,
  PubchiImportResult,
  PubchiQueryApplicationParams,
  PubchiQuerySuccess,
} from './pubchi.types';

export const PUBCHI_DELEGATION_DELETE_TIMEOUT_MS = 4_000;

type UnpublishOptions = {
  attemptRemote: boolean;
  includeLocalKeys?: boolean;
};

type TagSuggestionReceiptStatus = 'applying' | 'applied' | 'superseded' | 'failed' | 'reverted';
type TagSuggestionPublicState = 'absent' | 'present-canonical' | 'indeterminate';
type DraftPostReceiptStatus = 'applying' | 'applied' | 'failed' | 'reverted' | 'rejected';
type DraftPostPublicState = 'absent' | 'present' | 'indeterminate';
type TagSuggestionReconciliation = {
  status: Exclude<DiscoveredTagSuggestion['status'], 'applying'>;
  receiptStatus?: Exclude<TagSuggestionReceiptStatus, 'applying'>;
};

function reconcileTagSuggestionState({
  receiptStatus,
  tagState,
  operation,
  alreadyExisted,
  reportOutsideRemoval,
}: {
  receiptStatus: TagSuggestionReceiptStatus;
  tagState: TagSuggestionPublicState;
  operation: 'apply' | 'revert';
  alreadyExisted: boolean | null | undefined;
  reportOutsideRemoval: boolean;
}): TagSuggestionReconciliation {
  if (receiptStatus === 'superseded') return { status: 'superseded' };
  if (receiptStatus === 'reverted') return { status: 'reverted' };
  if (tagState === 'indeterminate') return { status: 'reconciliation-pending' };
  if (receiptStatus === 'applied' && tagState === 'present-canonical') return { status: 'applied' };
  if (receiptStatus === 'applied' && operation === 'revert') return { status: 'reverted', receiptStatus: 'reverted' };
  if (receiptStatus === 'applied' && reportOutsideRemoval) return { status: 'reverted-outside' };
  if (receiptStatus === 'failed' && tagState === 'absent') return { status: 'failed' };
  if (
    (receiptStatus === 'failed' || receiptStatus === 'applying') &&
    tagState === 'present-canonical' &&
    alreadyExisted !== null &&
    alreadyExisted !== undefined
  ) {
    const status = alreadyExisted ? 'superseded' : 'applied';
    return { status, receiptStatus: status };
  }
  if (receiptStatus === 'applying' && tagState === 'absent') return { status: 'failed', receiptStatus: 'failed' };
  return { status: 'reconciliation-pending' };
}

function reconcileDraftPostState({
  receiptStatus,
  postState,
  operation,
}: {
  receiptStatus: DraftPostReceiptStatus;
  postState: DraftPostPublicState;
  operation: 'apply' | 'reject' | 'revert';
}): {
  status: 'applied' | 'failed' | 'reverted' | 'rejected' | 'reconciliation-pending';
  receiptStatus?: 'applied' | 'failed' | 'reverted';
} {
  if (receiptStatus === 'rejected') return { status: 'rejected' };
  if (receiptStatus === 'reverted') return { status: 'reverted' };
  if (postState === 'indeterminate') return { status: 'reconciliation-pending' };
  if (receiptStatus === 'applied' && postState === 'present') return { status: 'applied' };
  if (receiptStatus === 'applied' && operation === 'revert' && postState === 'absent') {
    return { status: 'reverted', receiptStatus: 'reverted' };
  }
  if (receiptStatus === 'failed' && postState === 'absent') return { status: 'failed' };
  if ((receiptStatus === 'failed' || receiptStatus === 'applying') && postState === 'present') {
    return { status: 'applied', receiptStatus: 'applied' };
  }
  if (receiptStatus === 'applying' && postState === 'absent') return { status: 'failed', receiptStatus: 'failed' };
  return { status: 'reconciliation-pending' };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              // Expected multi-tab contention: keep Timeout category for isDrainTimeout
              // without Err.timeout's error-level log + Sentry capture.
              new AppError({
                category: ErrorCategory.Timeout,
                code: TimeoutErrorCode.REQUEST_TIMEOUT,
                message,
                service: ErrorService.Pubchi,
                operation: 'unpublishKnownDelegations',
              }),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class PubchiApplication {
  private static readonly deviceReadiness = new Map<string, Promise<boolean>>();
  private static readonly tagSuggestionOperationsInFlight = new Set<string>();
  private static readonly draftPostOperationsInFlight = new Set<string>();
  private static deviceListingHadFailures = false;
  private static deviceListingUnlistedSigners: string[] = [];
  private static deviceListingUnlistedCount = 0;

  private constructor() {}

  static beginTagSuggestionOperation(recordId: string, suggestionIndex: number): void {
    this.tagSuggestionOperationsInFlight.add(`${recordId}:${suggestionIndex}`);
  }

  static endTagSuggestionOperation(recordId: string, suggestionIndex: number): void {
    this.tagSuggestionOperationsInFlight.delete(`${recordId}:${suggestionIndex}`);
  }

  static tryBeginDraftPostOperation(recordId: string): boolean {
    if (this.draftPostOperationsInFlight.has(recordId)) return false;
    this.draftPostOperationsInFlight.add(recordId);
    return true;
  }

  static endDraftPostOperation(recordId: string): void {
    this.draftPostOperationsInFlight.delete(recordId);
  }

  static resetDraftPostOperationsForTests(): void {
    this.draftPostOperationsInFlight.clear();
  }

  static async runDraftPostOperation<T>(recordId: string, operation: string, work: () => Promise<T>): Promise<T> {
    if (!this.tryBeginDraftPostOperation(recordId)) {
      throw Err.client(ClientErrorCode.CONFLICT, 'Draft post operation is already in progress', {
        service: ErrorService.Pubchi,
        operation,
      });
    }
    try {
      return await work();
    } finally {
      this.endDraftPostOperation(recordId);
    }
  }

  static subscribeDatabaseBlocked(listener: (blocked: boolean) => void) {
    return LocalPubchiRecordService.subscribeDatabaseBlocked(listener);
  }

  static async clearOwnerData(owner: string, isCurrent: () => boolean = () => true): Promise<void> {
    await this.unpublishKnownDelegations(owner, { attemptRemote: false });
    await LocalPubchiRecordService.clearOwnerData(owner, isCurrent);
  }

  static deleteLocalDatabase(): Promise<void> {
    return LocalPubchiRecordService.deleteLocalDatabase();
  }

  static fetchBuiltFeedProvenance(owner: string) {
    return listPubchiFeedProvenance(owner);
  }

  static recordBuiltFeed(...args: Parameters<typeof recordPubchiBuiltFeed>) {
    return recordPubchiBuiltFeed(...args);
  }

  static getTagApplication(recordId: string) {
    return LocalPubchiRecordService.getTagApplication(recordId);
  }

  static getDraftPost(recordId: string) {
    return LocalPubchiRecordService.getDraftPost(recordId);
  }

  static ensureDeviceReady(owner: string): Promise<boolean> {
    const inFlight = this.deviceReadiness.get(owner);
    if (inFlight) return inFlight;
    let readiness!: Promise<boolean>;
    readiness = (async () => {
      try {
        return await this.ensureDeviceReadyOnce(owner);
      } finally {
        if (this.deviceReadiness.get(owner) === readiness) {
          this.deviceReadiness.delete(owner);
        }
      }
    })();
    this.deviceReadiness.set(owner, readiness);
    return readiness;
  }

  private static async ensureDeviceReadyOnce(owner: string): Promise<boolean> {
    const operationFence = HomeserverService.createWriteFence({ guardFirstPass: true });
    if (!isPubchiEnabled()) return false;
    const pointer = await readBotIfPresent(owner);
    if (!pointer) return false;
    const binding = await readOwnerBindingIfPresent(owner, pointer.bot);
    if (!binding || binding.owner !== owner || binding.bot !== pointer.bot || binding.status !== 'active') {
      return false;
    }
    await replaceLocalActiveBinding(binding, operationFence.assertCurrent);
    if (!sessionCanWritePubchi(owner)) return false;
    const device = await loadTrustedDeviceKey(owner, Math.floor(Date.now() / 1000));
    try {
      return await publishDeviceDelegation(owner, binding.bot, device);
    } catch {
      return false;
    }
  }

  static async loadPubchiConfig(owner: string, refreshDelegation = true): Promise<PubchiConfigV1 | null> {
    const url = pubchiConfigUri(owner);
    try {
      const parsed = parsePubchiDocumentText(await HomeserverService.requestRawText(url), parsePubchiConfigV1);
      if (!parsed.ok) throw pubchiValidationError(parsed.code, 'loadPubchiConfig');
      if (refreshDelegation) await refreshPublishedDelegation(owner);
      return parsed.value;
    } catch (error) {
      if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return null;
      throw error;
    }
  }

  static async savePubchiConfig(owner: string, partial: Partial<PubchiConfigV1>): Promise<PubchiConfigV1> {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return retryHomeserverWriteAfterReread(fence, async () => {
      assertPubchiCapability(owner);
      const binding = await LocalPubchiBindingService.readActive(owner);
      if (!binding) throw pubchiValidationError('BOT_MISMATCH', 'savePubchiConfig');
      const url = pubchiConfigUri(owner);
      let existing: PubchiConfigV1 | null;
      try {
        existing = await this.loadPubchiConfig(owner, false);
      } catch (error) {
        if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) throw error;
        existing = null;
      }
      const now = Math.floor(Date.now() / 1000);
      const currentBot = await readBotIfPresent(owner);
      if (!currentBot) throw pubchiValidationError('BOT_MISMATCH', 'savePubchiConfig');
      const requestedDisplayName = partial.display_name?.trim();
      const displayName = requestedDisplayName ?? currentBot.display_name;
      const candidate = {
        ...(existing ?? defaultPubchiConfig(owner, binding.bot, now)),
        ...partial,
        owner,
        bot: binding.bot,
        display_name: displayName,
        updated_at: now,
      };
      const parsed = parsePubchiConfigV1(candidate);
      if (!parsed.ok) throw pubchiValidationError(parsed.code, 'savePubchiConfig');
      const forbidden = scanForbiddenPublicState(candidate);
      if (!forbidden.ok) throw pubchiValidationError(forbidden.code, 'savePubchiConfig');
      const root = validatePublicRootReferences(candidate);
      if (!root.ok) throw pubchiValidationError(root.code, 'savePubchiConfig');
      const size = validatePubchiDocumentSize(candidate);
      if (!size.ok) throw pubchiValidationError(size.code, 'savePubchiConfig');
      if (displayName !== currentBot.display_name) {
        await putAndVerifyBot(owner, { ...currentBot, display_name: displayName }, currentBot);
      }
      await HomeserverService.request({ fence, method: HttpMethod.PUT, url, bodyJson: parsed.value });
      const readBack = await this.loadPubchiConfig(owner);
      if (!readBack || !deepEqual(readBack, parsed.value)) {
        throw pubchiValidationError('SCHEMA_INVALID', 'savePubchiConfig');
      }
      return readBack;
    });
  }

  static async loadPubchiSuggestion(owner: string, suggestionId: string): Promise<PubchiSuggestionV1 | null> {
    const url = pubchiSuggestionUri(owner, suggestionId);
    try {
      const parsed = parsePubchiDocumentText(await HomeserverService.requestRawText(url), parsePubchiSuggestionV1);
      if (!parsed.ok) throw pubchiValidationError(parsed.code, 'loadPubchiSuggestion');
      if (parsed.value.owner !== owner || parsed.value.suggestion_id !== suggestionId) {
        throw pubchiValidationError('SCHEMA_INVALID', 'loadPubchiSuggestion');
      }
      return parsed.value;
    } catch (error) {
      if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return null;
      throw error;
    }
  }

  static async listProactiveSuggestions(
    owner: string,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): Promise<PubchiSuggestionV1[]> {
    let files: string[] = [];
    try {
      files = await HomeserverService.listAll({ baseDirectory: pubchiSuggestionsDirectory(owner) });
    } catch (error) {
      if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return [];
      throw error;
    }
    const loaded: PubchiSuggestionV1[] = [];
    for (const file of files.sort()) {
      const suggestionId = file.match(/\/suggestions\/([^/]+)\.json$/)?.[1];
      if (!suggestionId) continue;
      try {
        const parsed = parsePubchiDocumentText(await HomeserverService.requestRawText(file), parsePubchiSuggestionV1);
        if (!parsed.ok || parsed.value.owner !== owner || parsed.value.suggestion_id !== suggestionId) continue;
        loaded.push(parsed.value);
      } catch (error) {
        if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) continue;
        throw error;
      }
    }
    return visibleProactiveSuggestions(loaded, owner, nowSeconds);
  }

  static async savePubchiSuggestion(owner: string, candidate: PubchiSuggestionV1): Promise<PubchiSuggestionV1> {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return retryHomeserverWriteAfterReread(fence, async () => {
      assertPubchiCapability(owner);
      if (candidate.owner !== owner) throw pubchiValidationError('SCHEMA_INVALID', 'savePubchiSuggestion');
      const parsed = parsePubchiSuggestionV1(candidate);
      if (!parsed.ok) throw pubchiValidationError(parsed.code, 'savePubchiSuggestion');
      const forbidden = scanForbiddenPublicState(candidate);
      if (!forbidden.ok) throw pubchiValidationError(forbidden.code, 'savePubchiSuggestion');
      const root = validatePublicRootReferences(candidate);
      if (!root.ok) throw pubchiValidationError(root.code, 'savePubchiSuggestion');
      const size = validatePubchiDocumentSize(candidate);
      if (!size.ok) throw pubchiValidationError(size.code, 'savePubchiSuggestion');
      const url = pubchiSuggestionUri(owner, parsed.value.suggestion_id);
      let existing: PubchiSuggestionV1 | null;
      try {
        existing = await this.loadPubchiSuggestion(owner, parsed.value.suggestion_id);
      } catch (error) {
        if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) throw error;
        existing = null;
      }
      if (existing) return existing;
      await HomeserverService.request({ fence, method: HttpMethod.PUT, url, bodyJson: parsed.value });
      const readBack = await this.loadPubchiSuggestion(owner, parsed.value.suggestion_id);
      if (!readBack || !deepEqual(readBack, parsed.value)) {
        throw pubchiValidationError('SCHEMA_INVALID', 'savePubchiSuggestion');
      }
      return readBack;
    });
  }

  static async runAppOpenProactive(
    owner: string,
    isCurrent: () => boolean,
    nowMs = Date.now(),
    visible = isAppForeground(),
  ): Promise<PubchiSuggestionV1[]> {
    if (!isCurrent()) return [];
    const nowSeconds = Math.floor(nowMs / 1000);
    const listed = await this.listProactiveSuggestions(owner, nowSeconds);
    if (!isCurrent()) return [];
    const config = await this.loadPubchiConfig(owner, false);
    if (!isCurrent()) return [];
    const proactive = proactiveFromConfig(config);
    const suggestionId = proactiveSuggestionId(nowMs);
    const session = HomeserverService.getCurrentSessionInfo();
    const gate = decideProactiveAsk({
      enabled: proactive.enabled,
      maxSuggestionsPerDay: proactive.max_suggestions_per_day,
      quietHoursUtc: proactive.quiet_hours_utc,
      nowMs,
      visible,
      hasSession: Boolean(session),
      asksToday: readAttemptState(owner, nowMs).count,
      existingSuggestionId: listed.find((item) => item.suggestion_id === suggestionId)?.suggestion_id ?? null,
    });
    if (!gate.ok) return listed;

    const locked = await withProactiveDayLock(nowMs, async () => {
      if (!isCurrent()) return [];
      if (hasProactiveDayClaim(owner, nowMs)) return this.listProactiveSuggestions(owner, nowSeconds);
      const existing = await this.loadPubchiSuggestion(owner, suggestionId);
      if (!isCurrent()) return [];
      if (existing) return this.listProactiveSuggestions(owner, nowSeconds);
      if (readAttemptState(owner, nowMs).count >= proactive.max_suggestions_per_day) {
        return this.listProactiveSuggestions(owner, nowSeconds);
      }
      if (!claimProactiveDay(owner, nowMs)) return this.listProactiveSuggestions(owner, nowSeconds);
      recordProactiveAttempt(owner, nowMs);
      let result: PubchiQuerySuccess;
      try {
        result = await this.query({
          owner,
          isCurrent,
          question: PROACTIVE_QUESTION,
          purpose: PROACTIVE_PURPOSE,
          nowSeconds,
        });
      } catch (error) {
        if (!isCurrent()) return [];
        Logger.warn('Pubchi app-open proactive query failed', { error, owner });
        return this.listProactiveSuggestions(owner, nowSeconds);
      }
      if (!isCurrent()) return [];
      if (result.kind !== 'answer') return this.listProactiveSuggestions(owner, nowSeconds);
      const built = suggestionFromAnswer(result.result, { suggestionId, nowSeconds });
      if (!built) return this.listProactiveSuggestions(owner, nowSeconds);
      await this.savePubchiSuggestion(owner, built);
      return this.listProactiveSuggestions(owner, nowSeconds);
    });
    if (!locked.acquired) return listed;
    return locked.value;
  }

  static async exportPubchiState(
    owner: string,
    params: PubchiExportParams = {},
  ): Promise<PubchiImportPreview['bundle']> {
    const includeHistory = Boolean(params.includeHistory);
    const pointer = await readBotIfPresent(owner);
    if (!pointer) throw pubchiValidationError('BOT_MISMATCH', 'exportPubchiState');
    const documents = await listPublicPubchiDocuments(owner, includeHistory);
    const built = await buildExportBundle(documents, {
      bot: pointer.bot,
      owner,
      exportedAt: Math.floor(Date.now() / 1000),
      includeHistory,
    });
    if (!built.ok) throw pubchiValidationError(built.code, 'exportPubchiState');
    return built.value;
  }

  static async planImportPubchiState(owner: string, input: unknown): Promise<PubchiImportPreview> {
    const parsed = await parseExportBundle(input);
    if (!parsed.ok) throw pubchiValidationError(parsed.code, 'planImportPubchiState');
    const pointer = await readBotIfPresent(owner);
    const binding = pointer ? await readOwnerBindingIfPresent(owner, parsed.value.bot) : undefined;
    const destinationBodies = Object.fromEntries(
      (await listPublicPubchiDocuments(owner, parsed.value.include_history)).map((document) => [
        document.path,
        document.body,
      ]),
    );
    const planned = await planImport({
      bundle: parsed.value,
      destinationOwner: owner,
      destinationBot: pointer?.bot ?? null,
      destinationBindingBot: binding?.bot ?? null,
      destinationBodies,
    });
    if (!planned.ok) throw pubchiValidationError(planned.code, 'planImportPubchiState');
    const feeds = reconstructFeedsFromBundle(parsed.value);
    if (!feeds.ok) throw pubchiValidationError(feeds.code, 'planImportPubchiState');
    return { bundle: parsed.value, plan: planned.value, feeds: feeds.value };
  }

  static async importPubchiState(owner: string, input: unknown): Promise<PubchiImportResult> {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return retryHomeserverWriteAfterReread(fence, async () => {
      assertPubchiCapability(owner);
      const preview = await this.planImportPubchiState(owner, input);
      const encoder = new TextEncoder();
      for (const path of importWriteOrder(preview.bundle)) {
        const body = preview.bundle.objects[path];
        if (body === undefined) continue;
        await HomeserverService.putBlob({ fence, url: `pubky://${owner}${path}`, blob: encoder.encode(body) });
      }
      const written = Object.fromEntries(
        (await listPublicPubchiDocuments(owner, preview.bundle.include_history)).map((document) => [
          document.path,
          document.body,
        ]),
      );
      const hashes: Record<string, string> = {};
      for (const [path, expectedHash] of Object.entries(preview.plan.hashes)) {
        const body = written[path];
        if (body === undefined || body !== preview.bundle.objects[path]) {
          throw pubchiValidationError('BODY_HASH_MISMATCH', 'importPubchiState');
        }
        const actual = await hashDocumentBody(body);
        if (actual !== expectedHash) throw pubchiValidationError('BODY_HASH_MISMATCH', 'importPubchiState');
        hashes[path] = actual;
      }
      return { ...preview, hashes };
    });
  }

  static async loadPubchiContext(owner: string): Promise<PubchiOwnerContextV1 | null> {
    const session = HomeserverService.getCurrentSessionInfo();
    if (
      !session ||
      session.publicKey.z32() !== owner ||
      !sessionCovers(session.capabilities ?? [], PUBCHI_PRIVATE_DIRECTORY)
    )
      return null;
    try {
      const raw = await HomeserverService.request<unknown>({ method: HttpMethod.GET, url: pubchiContextUri(owner) });
      const size = validatePubchiDocumentSize(raw);
      if (!size.ok) throw pubchiValidationError(size.code, 'loadPubchiContext');
      const parsed = parsePubchiOwnerContextV1(raw);
      if (!parsed.ok) throw pubchiValidationError(parsed.code, 'loadPubchiContext');
      return parsed.value;
    } catch (error) {
      if (
        hasHttpStatus(error, HttpStatusCode.NOT_FOUND) ||
        hasHttpStatus(error, HttpStatusCode.UNAUTHORIZED) ||
        hasHttpStatus(error, HttpStatusCode.FORBIDDEN)
      ) {
        return null;
      }
      throw error;
    }
  }

  static async savePubchiContext(
    owner: string,
    partial: Pick<PubchiOwnerContextV1, 'about' | 'instructions'>,
  ): Promise<PubchiOwnerContextV1> {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return retryHomeserverWriteAfterReread(fence, async () => {
      const session = HomeserverService.getCurrentSessionInfo();
      if (
        !session ||
        session.publicKey.z32() !== owner ||
        !sessionCovers(session.capabilities ?? [], PUBCHI_PRIVATE_DIRECTORY)
      ) {
        throw pubchiValidationError('PATH_FORBIDDEN', 'savePubchiContext');
      }
      const existing = await this.loadPubchiContext(owner);
      const candidate = {
        schema: 'pubchi-owner-context' as const,
        version: 1 as const,
        ...(existing ?? {}),
        ...partial,
        updated_at: Math.floor(Date.now() / 1000),
      };
      const parsed = parsePubchiOwnerContextV1(candidate);
      if (!parsed.ok) throw pubchiValidationError(parsed.code, 'savePubchiContext');
      const size = validatePubchiDocumentSize(candidate);
      if (!size.ok) throw pubchiValidationError(size.code, 'savePubchiContext');
      const url = pubchiContextUri(owner);
      await HomeserverService.request({ fence, method: HttpMethod.PUT, url, bodyJson: parsed.value });
      const readBack = await this.loadPubchiContext(owner);
      if (!readBack || !deepEqual(readBack, parsed.value)) {
        throw pubchiValidationError('SCHEMA_INVALID', 'savePubchiContext');
      }
      return readBack;
    });
  }

  static async loadPubchiCursor(owner: string): Promise<string | null> {
    const session = HomeserverService.getCurrentSessionInfo();
    if (
      !session ||
      session.publicKey.z32() !== owner ||
      !sessionCovers(session.capabilities ?? [], PUBCHI_PRIVATE_DIRECTORY)
    )
      return null;
    try {
      const value = await HomeserverService.request<unknown>({ method: HttpMethod.GET, url: pubchiCursorUri(owner) });
      if (!value || typeof value !== 'object' || typeof (value as { cursor?: unknown }).cursor !== 'string')
        return null;
      return (value as { cursor: string }).cursor;
    } catch (error) {
      if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return null;
      throw error;
    }
  }

  static async savePubchiCursor(owner: string, cursor: string): Promise<void> {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return retryHomeserverWriteAfterReread(fence, async () => {
      const session = HomeserverService.getCurrentSessionInfo();
      const sessionPubky = session?.publicKey?.z32?.();
      if (!session || sessionPubky !== owner || !sessionCovers(session.capabilities ?? [], PUBCHI_PRIVATE_DIRECTORY)) {
        throw pubchiValidationError('PATH_FORBIDDEN', 'savePubchiCursor');
      }
      const nextTime = Date.parse(cursor);
      if (Number.isNaN(nextTime)) return;
      const existing = await this.loadPubchiCursor(owner);
      if (existing !== null) {
        const existingTime = Date.parse(existing);
        if (Number.isNaN(existingTime) || nextTime <= existingTime) return;
      }
      await HomeserverService.request({
        fence,
        method: HttpMethod.PUT,
        url: pubchiCursorUri(owner),
        bodyJson: { cursor },
      });
    });
  }

  static async getActiveBinding(owner: string): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'getActiveBinding',
      });
    }
    return LocalPubchiBindingService.readActive(owner);
  }

  static async listDeviceDelegations(owner: string): Promise<DeviceDelegationV1[]> {
    if (!isPubchiEnabled()) return [];
    const files = await HomeserverService.listAll({ baseDirectory: devicesUri(owner) });
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const signer = file.match(/\/devices\/([^/]+)\.json$/)?.[1];
        if (!signer || !isPubkyId(signer)) return { signer: undefined, device: undefined, failed: false };
        try {
          const parsed = parseDeviceDelegationV1(
            await HomeserverService.request<unknown>({ method: HttpMethod.GET, url: delegationUri(owner, signer) }),
          );
          if (!parsed.ok || parsed.value.owner !== owner || parsed.value.signer !== signer) {
            return { signer, device: undefined, failed: false };
          }
          return { signer, device: parsed.value, failed: false };
        } catch {
          return { signer, device: undefined, failed: true };
        }
      }),
    );
    this.deviceListingHadFailures = results.some((result) => result.status === 'fulfilled' && result.value.failed);
    this.deviceListingUnlistedCount = results.filter(
      (result) => result.status === 'rejected' || !result.value.device,
    ).length;
    this.deviceListingUnlistedSigners = results.flatMap((result) => {
      if (result.status === 'rejected' || !result.value.device) {
        const signer = result.status === 'fulfilled' ? result.value.signer : undefined;
        return signer && isPubkyId(signer) ? [signer] : [];
      }
      return [];
    });
    return results.flatMap((result) =>
      result.status === 'fulfilled' && result.value.device ? [result.value.device] : [],
    );
  }

  static hadDeviceListingFailures(): boolean {
    return this.deviceListingHadFailures;
  }

  static getUnlistedDeviceSigners(): string[] {
    return [...this.deviceListingUnlistedSigners];
  }

  static async revokeDevice(owner: string, signer: string): Promise<void> {
    if (!isPubkyId(owner) || !isPubkyId(signer)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'revokeDevice',
      });
    }
    const pending = { owner, signer };
    if (!rememberPendingDelegationDeletes([pending])) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Could not persist Pubchi device revocation', {
        service: ErrorService.Pubchi,
        operation: 'revokeDevice',
      });
    }
    if (!sessionCanWritePubchi(owner)) {
      await deleteDeviceKey(owner, signer);
      return;
    }
    await deleteAndVerifyMissing(delegationUri(owner, signer), 'revokeDevice');
    replacePendingDelegationDeletesForOwner(
      owner,
      ownerPending(owner).filter((item) => item.signer !== signer),
    );
    await deleteDeviceKey(owner, signer);
  }

  static async revokeAllDevices(owner: string): Promise<{
    revoked: string[];
    failed: string[];
    unlisted: number;
  }> {
    const [remote, local] = await Promise.all([this.listDeviceDelegations(owner), getDeviceKeys(owner)]);
    for (const device of local) {
      if (!isPubkyId(device.signer)) {
        await deleteDeviceKey(owner, device.signer);
      }
    }
    const unlistedSigners = this.getUnlistedDeviceSigners();
    rememberPendingDelegationDeletes(unlistedSigners.map((signer) => ({ owner, signer })));
    const signers = new Set([
      ...remote.map((device) => device.signer),
      ...local.filter((device) => isPubkyId(device.signer)).map((device) => device.signer),
      ...unlistedSigners,
    ]);
    const results = await Promise.allSettled([...signers].map((signer) => this.revokeDevice(owner, signer)));
    if (!sessionCanWritePubchi(owner)) {
      return {
        revoked: [],
        failed: [...signers],
        unlisted: this.deviceListingUnlistedCount,
      };
    }
    return {
      revoked: results.flatMap((result, index) => (result.status === 'fulfilled' ? [[...signers][index]!] : [])),
      failed: results.flatMap((result, index) => (result.status === 'rejected' ? [[...signers][index]!] : [])),
      unlisted: this.deviceListingUnlistedCount,
    };
  }

  static async createPubchi(params: CreatePubchiParams): Promise<CreatedPubchi> {
    const operationFence = HomeserverService.createWriteFence({ guardFirstPass: true });
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'createPubchi',
      });
    }
    if (!capabilitiesCoverPubchiWrite(params.capabilities)) {
      throw pubchiValidationError('PATH_FORBIDDEN', 'createPubchi');
    }

    const existingPointer = await readBotIfPresent(params.owner);
    const existingBinding = existingPointer
      ? await readOwnerBindingIfPresent(params.owner, existingPointer.bot)
      : undefined;
    operationFence.assertCurrent();

    if (
      existingPointer &&
      existingBinding?.owner === params.owner &&
      existingBinding.bot === existingPointer.bot &&
      existingBinding.status === 'active'
    ) {
      await replaceLocalActiveBinding(existingBinding, operationFence.assertCurrent);
      await refreshPublishedDelegation(params.owner);
      throw Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
        service: ErrorService.Pubchi,
        operation: 'createPubchi',
      });
    }
    await tombstoneUnreferencedRemoteBindings(params.owner, existingPointer?.bot, true);
    if (existingPointer?.homeserver_account !== null && existingPointer?.homeserver_account !== undefined) {
      throw Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
        service: ErrorService.Pubchi,
        operation: 'createPubchi',
      });
    }

    const { bot, phrase } = mintBotKey();
    const now = Math.floor(Date.now() / 1000);
    const keyGeneration = existingPointer ? existingPointer.key_generation + 1 : 1;
    const createdAt = existingPointer?.created_at ?? now;
    const displayName = existingPointer?.display_name ?? params.displayName.trim();
    const bindingCandidate = {
      schema: 'pubchi-owner-binding' as const,
      version: 1 as const,
      owner: params.owner,
      bot,
      status: 'active' as const,
      key_generation: keyGeneration,
      created_at: createdAt,
      updated_at: now,
    };
    const parsedBinding = parseOwnerBindingV1(bindingCandidate);
    if (!parsedBinding.ok) throw pubchiValidationError(parsedBinding.code, 'createPubchi');

    const pointerCandidate = {
      schema: 'pubchi-bot' as const,
      version: 1 as const,
      bot,
      owner: params.owner,
      display_name: displayName,
      created_at: createdAt,
      backup_confirmed_at: null,
      homeserver_account: null,
      key_generation: keyGeneration,
    };
    const parsedPointer = parsePubchiBotV1(pointerCandidate);
    if (!parsedPointer.ok) throw pubchiValidationError(parsedPointer.code, 'createPubchi');

    operationFence.assertCurrent();
    await putAndVerifyOwnerBinding(params.owner, parsedBinding.value);
    operationFence.assertCurrent();
    await putAndVerifyBot(params.owner, parsedPointer.value, existingPointer);
    await readAndVerifyOwnerBinding(params.owner, parsedBinding.value);
    if (existingPointer) {
      await tombstoneBindingIfActive(params.owner, existingPointer.bot, now);
    }
    operationFence.assertCurrent();
    await replaceLocalActiveBinding(parsedBinding.value, operationFence.assertCurrent);

    operationFence.assertCurrent();
    const device = await loadTrustedDeviceKey(params.owner, now);
    operationFence.assertCurrent();
    const delegation: UnsignedDeviceDelegationV1 = {
      schema: 'pubchi-device-delegation',
      version: 1,
      owner: params.owner,
      signer: device.signer,
      bot,
      purposes: ['ask', 'who-tagged-me', 'build-feed'],
      created_at: device.created_at,
      expires_at: device.expires_at,
    };
    const signedDelegation = await signDeviceDelegationV1(delegation, device.key);
    const delegationRoot = validatePublicRootReferences(signedDelegation);
    if (!delegationRoot.ok) throw pubchiValidationError(delegationRoot.code, 'createPubchi');
    const delegationSize = validatePubchiDocumentSize(signedDelegation);
    if (!delegationSize.ok) throw pubchiValidationError(delegationSize.code, 'createPubchi');
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    await retryHomeserverWriteAfterReread(fence, () =>
      HomeserverService.request({
        method: HttpMethod.PUT,
        url: delegationUri(params.owner, device.signer),
        bodyJson: signedDelegation,
        fence,
      }),
    );
    const delegationReadback = parseDeviceDelegationV1(
      await HomeserverService.request({
        method: HttpMethod.GET,
        url: delegationUri(params.owner, device.signer),
      }),
    );
    if (!delegationReadback.ok || !sameDelegation(delegationReadback.value, signedDelegation)) {
      throw pubchiValidationError('DELEGATION_INVALID', 'createPubchi');
    }

    return {
      bot,
      displayName: parsedPointer.value.display_name,
      createdAt: createdAt,
      backupConfirmedAt: null,
      verified: true,
      phrase,
    };
  }

  static async loadPubchi(owner: string): Promise<LoadedPubchi | undefined> {
    const operationFence = HomeserverService.createWriteFence({ guardFirstPass: true });
    const pointer = await readBotIfPresent(owner);
    if (!pointer) return undefined;
    const binding = await readOwnerBindingIfPresent(owner, pointer.bot);
    await tombstoneUnreferencedRemoteBindings(owner, pointer.bot, false);
    const verified = binding?.bot === pointer.bot && binding.owner === pointer.owner && binding.status === 'active';
    if (verified && binding) {
      await replaceLocalActiveBinding(binding, operationFence.assertCurrent);
      await refreshPublishedDelegation(owner);
    }

    return {
      bot: pointer.bot,
      displayName: pointer.display_name,
      createdAt: pointer.created_at,
      backupConfirmedAt: pointer.backup_confirmed_at,
      verified,
    };
  }

  static async confirmBackup(params: ConfirmPubchiBackupParams): Promise<LoadedPubchi> {
    if (params.confirmations.length !== 3 || new Set(params.confirmations.map((item) => item.position)).size !== 3) {
      throw pubchiValidationError('SCHEMA_INVALID', 'confirmBackup');
    }
    const words = params.phrase.split(' ');
    const matches = params.confirmations.every(
      ({ position, word }) => position >= 0 && position < 12 && words[position] === word.trim().toLowerCase(),
    );
    if (!matches) throw pubchiValidationError('SIGNATURE_INVALID', 'confirmBackup');

    const bot = phraseToBot(params.phrase);
    const currentRaw = await HomeserverService.request({ method: HttpMethod.GET, url: botUri(params.owner) });
    const current = parsePubchiBotV1(currentRaw);
    if (!current.ok || current.value.owner !== params.owner || current.value.bot !== bot) {
      throw pubchiValidationError(current.ok ? 'BOT_MISMATCH' : current.code, 'confirmBackup');
    }
    const updated = { ...current.value, backup_confirmed_at: Math.floor(Date.now() / 1000) };
    await putAndVerifyBot(params.owner, updated, current.value);
    const loaded = await PubchiApplication.loadPubchi(params.owner);
    if (!loaded || loaded.backupConfirmedAt === null) {
      throw pubchiValidationError('SCHEMA_INVALID', 'confirmBackup');
    }
    return loaded;
  }

  static async commitCreateBinding(params: PubchiBindingWriteParams): Promise<PubchiBindingRecordResult> {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return retryHomeserverWriteAfterReread(fence, async () => {
      if (!isPubchiEnabled()) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
          service: ErrorService.Pubchi,
          operation: 'commitCreateBinding',
        });
      }

      assertPubchiCapability(params.owner);
      const pointer = await readBotIfPresent(params.owner);
      if (pointer && pointer.bot !== params.bot) {
        throw Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
          service: ErrorService.Pubchi,
          operation: 'commitCreateBinding',
        });
      }
      const active = await LocalPubchiBindingService.readActive(params.owner);
      if (active && active.bot !== params.bot) {
        throw Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
          service: ErrorService.Pubchi,
          operation: 'commitCreateBinding',
        });
      }

      const now = Math.floor(Date.now() / 1000);
      const device = await loadTrustedDeviceKey(params.owner, now);
      const existing = await LocalPubchiBindingService.read(params.owner, params.bot);
      const createdAt = existing?.created_at ?? now;
      const candidate = {
        schema: 'pubchi-owner-binding' as const,
        version: 1 as const,
        owner: params.owner,
        bot: params.bot,
        status: 'active' as const,
        created_at: createdAt,
        updated_at: now,
      };
      const parsed = parseOwnerBindingV1(candidate);
      if (!parsed.ok) throw pubchiValidationError(parsed.code, 'commitCreateBinding');
      const forbidden = scanForbiddenPublicState(candidate);
      if (!forbidden.ok) throw pubchiValidationError(forbidden.code, 'commitCreateBinding');

      const record = { ...parsed.value, id: bindingRecordId(params.owner, params.bot) };
      await LocalPubchiBindingService.upsert(record, fence.assertCurrent);

      try {
        const delegation: UnsignedDeviceDelegationV1 = {
          schema: 'pubchi-device-delegation',
          version: 1,
          owner: params.owner,
          signer: device.signer,
          bot: params.bot,
          purposes: [...SERVED_DELEGATION_PURPOSES],
          created_at: device.created_at,
          expires_at: device.expires_at,
        };
        const signedDelegation = await signDeviceDelegationV1(delegation, device.key);
        const delegationRoot = validatePublicRootReferences(signedDelegation);
        if (!delegationRoot.ok) throw pubchiValidationError(delegationRoot.code, 'commitCreateBinding');
        const delegationSize = validatePubchiDocumentSize(signedDelegation);
        if (!delegationSize.ok) throw pubchiValidationError(delegationSize.code, 'commitCreateBinding');
        await HomeserverService.request({
          fence,
          method: HttpMethod.PUT,
          url: delegationUri(params.owner, device.signer),
          bodyJson: signedDelegation,
        });
        const ownerBindingRoot = validatePublicRootReferences(parsed.value);
        if (!ownerBindingRoot.ok) throw pubchiValidationError(ownerBindingRoot.code, 'commitCreateBinding');
        const ownerBindingSize = validatePubchiDocumentSize(parsed.value);
        if (!ownerBindingSize.ok) throw pubchiValidationError(ownerBindingSize.code, 'commitCreateBinding');
        await HomeserverService.request({
          fence,
          method: HttpMethod.PUT,
          url: ownerBindingUri(params.owner, params.bot),
          bodyJson: parsed.value,
        });
      } catch (error) {
        let rollbackError: unknown;
        try {
          await rollbackBindingWrite(params, existing);
        } catch (rollbackFailure) {
          rollbackError = rollbackFailure;
          Logger.error(
            '[PubchiApplication.commitCreateBinding] Failed to rollback local binding write',
            rollbackFailure,
          );
        }
        await HomeserverService.request({
          fence,
          method: HttpMethod.DELETE,
          url: delegationUri(params.owner, device.signer),
        }).catch(() => {
          rememberPendingDelegationDeletes([{ owner: params.owner, signer: device.signer }]);
        });
        await deleteDeviceKey(params.owner, device.signer).catch(() => undefined);
        throw Err.server(
          ServerErrorCode.INTERNAL_ERROR,
          error instanceof Error ? error.message : 'PUBCHI_BINDING_WRITE_FAILED',
          {
            service: ErrorService.Pubchi,
            operation: 'commitCreateBinding',
            cause: error,
            context: { rollbackError },
          },
        );
      }

      return parsed.value;
    });
  }

  static async commitDeleteBinding(params: PubchiBindingWriteParams): Promise<void> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      });
    }

    const pointer = await readBotIfPresent(params.owner);
    const bot = pointer?.bot ?? params.bot;
    await deleteAndVerifyMissing(ownerBindingUri(params.owner, bot), 'commitDeleteBinding');
    if (pointer?.bot === bot) {
      await deleteAndVerifyMissing(botUri(params.owner), 'commitDeleteBinding');
    }
    await LocalPubchiBindingService.delete(params.owner, bot);
  }

  /**
   * Record known device delegations and, when `attemptRemote` is true, DELETE
   * each `delegationUri` while the session still covers write on `/pub/app.pubchi/v1/`.
   *
   * Does NOT delete the owner binding at `/pub/app.pubchi/v1/bots/<bot>.json`.
   * That object is the account-level U→B enrollment; logout revokes this
   * browser's device key, not the bot binding. "Remove bot" is the unenroll path.
   *
   * Never throws: a homeserver failure is recorded in localStorage so the next
   * session of the same owner can finish the DELETE. A previous identity's
   * remote delegation cannot be revoked without that identity's live session.
   *
   * When `includeLocalKeys` is false (sign-in / reconcile drains), a stored
   * record that names a currently-live local device key is skipped (no DELETE)
   * but retained. Logout keeps the default `includeLocalKeys: true` so the
   * live device is revoked.
   */
  static async unpublishKnownDelegations(
    owner: string | undefined,
    options: UnpublishOptions = { attemptRemote: true },
  ): Promise<{ failed: PendingDelegationDelete[] }> {
    try {
      if (!owner) return { failed: [] };

      const includeLocalKeys = options.includeLocalKeys !== false;
      const listed = includeLocalKeys ? await listKnownDelegations(owner) : { kind: 'ok' as const, items: [] };
      if (listed.kind === 'defer') {
        Logger.warn('Pubchi device-key read timed out; deferring pending drain', { owner });
        return { failed: ownerPending(owner) };
      }
      const known = listed.items;
      if (known.length === 0 && ownerPending(owner).length === 0) return { failed: [] };
      if (known.length) rememberPendingDelegationDeletes(known);

      const liveLookup = await liveDeviceSigners(owner);
      if (!liveLookup.ok && (liveLookup.defer || !includeLocalKeys)) {
        Logger.warn('Pubchi live-device lookup failed; deferring pending drain', { owner });
        return { failed: ownerPending(owner) };
      }
      const liveSigners = liveLookup.ok ? liveLookup.signers : new Set<string>();
      const skippedLive: PendingDelegationDelete[] = [];
      const toDeleteByKey = new Map<string, PendingDelegationDelete>();
      for (const item of [...ownerPending(owner), ...known]) {
        const parsed = parsePendingEntry(item);
        if (!parsed) continue;
        if (!includeLocalKeys && liveSigners.has(parsed.signer)) {
          skippedLive.push(parsed);
          continue;
        }
        toDeleteByKey.set(`${parsed.owner}:${parsed.signer}`, parsed);
      }
      const toDelete = [...toDeleteByKey.values()];
      if (!options.attemptRemote) {
        return { failed: dedupePending([...skippedLive, ...toDelete]) };
      }
      if (!sessionCanWritePubchi(owner)) {
        const retained = dedupePending([...skippedLive, ...toDelete]);
        replacePendingDelegationDeletesForOwner(owner, retained);
        return { failed: retained };
      }

      const retryable: PendingDelegationDelete[] = [];
      const authTerminal: PendingDelegationDelete[] = [];
      const results = await Promise.allSettled(
        toDelete.map((item) =>
          withTimeout(
            deleteDelegationRecord(item),
            PUBCHI_DELEGATION_DELETE_TIMEOUT_MS,
            'Pubchi delegation DELETE timed out',
          ),
        ),
      );
      results.forEach((result, index) => {
        const item = toDelete[index];
        if (!item) return;
        if (result.status === 'fulfilled') return;
        const error = result.reason;
        if (isAuthDenied(error)) {
          authTerminal.push(item);
          return;
        }
        Logger.warn('Pubchi delegation DELETE failed; logout continues', {
          owner: item.owner,
          signer: item.signer,
          error,
        });
        retryable.push(item);
      });
      const retained = dedupePending([...skippedLive, ...authTerminal, ...retryable]);
      replacePendingDelegationDeletesForOwner(owner, retained);
      return { failed: retained };
    } catch (error) {
      Logger.warn('Pubchi unpublish threw; sign-out continues', { error });
      return { failed: owner ? ownerPending(owner) : [] };
    }
  }

  /**
   * Reconcile the Dexie binding with the homeserver object at
   * `pubky://<owner>/pub/app.pubchi/v1/bots/<B>.json`. Revoke the local row only
   * on explicit 404/absence or a parsed body with `status !== 'active'`.
   * A malformed 200 or a parsed body whose `owner`/`bot` do not match the
   * requested binding is treated as transient — the local row is kept.
   */
  static async reconcileActiveBinding(owner: string): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'reconcileActiveBinding',
      });
    }

    await wipeLocalStateFromOtherIdentities(owner);
    await PubchiApplication.unpublishKnownDelegations(owner, { attemptRemote: true, includeLocalKeys: false });

    const local = await LocalPubchiBindingService.readActive(owner);
    if (!local) return findLegacyActiveBinding(owner);

    const uri = ownerBindingUri(owner, local.bot);
    let present: boolean;
    try {
      present = await HomeserverService.exists(uri);
    } catch {
      return local;
    }

    if (!present) {
      await markBindingRevoked(local);
      return undefined;
    }

    try {
      const remote = await HomeserverService.request({ method: HttpMethod.GET, url: uri });
      const parsed = parseOwnerBindingV1(remote);
      if (!parsed.ok) {
        return local;
      }
      if (parsed.value.status !== 'active') {
        await markBindingRevoked(local);
        return undefined;
      }
      if (parsed.value.bot !== local.bot || parsed.value.owner !== owner) {
        return local;
      }
      const record = { ...parsed.value, id: bindingRecordId(owner, parsed.value.bot) };
      await LocalPubchiBindingService.upsert(record);
      await refreshPublishedDelegation(owner);
      return parsed.value;
    } catch {
      return local;
    }
  }

  static async prepareTagSuggestionApplication(
    recordId: string,
    suggestionIndex: number,
    owner: string,
    capabilities: string[],
  ) {
    const record = await LocalPubchiRecordService.getTagApplication(recordId);
    const binding = record ? tagApplicationBinding(record) : undefined;
    if (
      !record ||
      !binding ||
      record.owner !== owner ||
      !canApplyTagSuggestion(binding, suggestionIndex, { info: { capabilities } })
    ) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion binding is no longer applicable', {
        service: ErrorService.Pubchi,
        operation: 'prepareTagSuggestionApplication',
      });
    }
    const responseSha256 = await sha256Hex(canonicalJson(record.response));
    if (responseSha256 !== record.response_sha256 || record.response_run_id !== binding.response.run_id) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Stored Pubchi tag suggestion response is invalid', {
        service: ErrorService.Pubchi,
        operation: 'prepareTagSuggestionApplication',
      });
    }
    const suggestion = binding.response.tag_suggestions?.[suggestionIndex];
    if (!suggestion || !binding.response.target?.snapshot_sha256) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion is missing', {
        service: ErrorService.Pubchi,
        operation: 'prepareTagSuggestionApplication',
      });
    }
    await this.assertTagSuggestionTargetUnchanged(binding);
    const applicationId = await sha256Hex(
      canonicalJson({
        owner: binding.owner,
        run_id: binding.response.run_id,
        target_uri: binding.target.uri,
        label: suggestion.label,
      }),
    );
    await this.writeTagSuggestionReceipt(binding, suggestionIndex, applicationId, 'applying');
    await LocalPubchiRecordService.updateTagApplication(recordId, {
      statuses: { ...(record.statuses ?? {}), [suggestionIndex]: 'applying' },
      operations: { ...(record.operations ?? {}), [suggestionIndex]: 'apply' },
      already_existed: { ...(record.already_existed ?? {}), [suggestionIndex]: null },
      tag_document_sha256: { ...(record.tag_document_sha256 ?? {}), [suggestionIndex]: null },
      updated_at: Date.now(),
    });
    return { binding, applicationId, suggestion };
  }

  private static async assertTagSuggestionTargetUnchanged(
    binding: NonNullable<ReturnType<typeof tagApplicationBinding>>,
  ): Promise<void> {
    const expected = binding.response.target?.snapshot_sha256;
    if (!expected) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Target changed — ask again', {
        service: ErrorService.Pubchi,
        operation: 'assertTagSuggestionTargetUnchanged',
      });
    }
    try {
      const raw = await HomeserverService.requestRawText(binding.target.uri);
      const source: unknown = JSON.parse(raw);
      if (!source || Array.isArray(source) || typeof source !== 'object')
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Target changed — ask again', {
          service: ErrorService.Pubchi,
          operation: 'validatePubchiState',
        });
      const value = source as Record<string, unknown>;
      const projection = projectTargetSnapshot(binding.target, value);
      if ((await sha256Hex(canonicalJson(projection))) !== expected)
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Target changed — ask again', {
          service: ErrorService.Pubchi,
          operation: 'validatePubchiState',
        });
    } catch (cause) {
      if (cause instanceof AppError && !hasHttpStatus(cause, HttpStatusCode.NOT_FOUND)) throw cause;
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Target changed — ask again', {
        service: ErrorService.Pubchi,
        operation: 'assertTagSuggestionTargetUnchanged',
        cause,
      });
    }
  }

  static async finalizeTagSuggestionApplication(
    recordId: string,
    suggestionIndex: number,
    applicationId: string,
    status: 'applied' | 'superseded' | 'failed' | 'reverted',
    tagUri?: string,
    alreadyExisted?: boolean | null,
  ): Promise<void> {
    const record = await LocalPubchiRecordService.getTagApplication(recordId);
    const binding = record ? tagApplicationBinding(record) : undefined;
    if (!record || !binding) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Stored Pubchi tag suggestion is missing', {
        service: ErrorService.Pubchi,
        operation: 'finalizeTagSuggestionApplication',
      });
    }
    await this.writeTagSuggestionReceipt(
      binding,
      suggestionIndex,
      applicationId,
      status,
      tagUri,
      alreadyExisted,
      record.tag_document_sha256?.[suggestionIndex],
    );
    await LocalPubchiRecordService.updateTagApplication(recordId, {
      statuses: { ...(record.statuses ?? {}), [suggestionIndex]: status },
      updated_at: Date.now(),
    });
  }

  static async markTagSuggestionReconciliationPending(recordId: string, suggestionIndex: number): Promise<void> {
    const record = await LocalPubchiRecordService.getTagApplication(recordId);
    if (!record) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Stored Pubchi tag suggestion is missing', {
        service: ErrorService.Pubchi,
        operation: 'markTagSuggestionReconciliationPending',
      });
    }
    await LocalPubchiRecordService.updateTagApplication(recordId, {
      statuses: { ...(record.statuses ?? {}), [suggestionIndex]: 'reconciliation-pending' },
      updated_at: Date.now(),
    });
  }

  static async recordTagSuggestionApplyOutcome(
    recordId: string,
    suggestionIndex: number,
    alreadyExisted: boolean,
    tagDocumentSha256: string | undefined,
  ): Promise<void> {
    if (!tagDocumentSha256 || !/^[a-f0-9]{64}$/.test(tagDocumentSha256)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag application document proof is missing', {
        service: ErrorService.Pubchi,
        operation: 'recordTagSuggestionApplyOutcome',
      });
    }
    const record = await LocalPubchiRecordService.getTagApplication(recordId);
    if (!record) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Stored Pubchi tag suggestion is missing', {
        service: ErrorService.Pubchi,
        operation: 'recordTagSuggestionApplyOutcome',
      });
    }
    await LocalPubchiRecordService.updateTagApplication(recordId, {
      operations: { ...(record.operations ?? {}), [suggestionIndex]: 'apply' },
      already_existed: { ...(record.already_existed ?? {}), [suggestionIndex]: alreadyExisted },
      tag_document_sha256: { ...(record.tag_document_sha256 ?? {}), [suggestionIndex]: tagDocumentSha256 },
      updated_at: Date.now(),
    });
  }

  static async recordTagSuggestionRevertOperation(recordId: string, suggestionIndex: number): Promise<void> {
    const record = await LocalPubchiRecordService.getTagApplication(recordId);
    if (!record) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Stored Pubchi tag suggestion is missing', {
        service: ErrorService.Pubchi,
        operation: 'recordTagSuggestionRevertOperation',
      });
    }
    await LocalPubchiRecordService.updateTagApplication(recordId, {
      operations: { ...(record.operations ?? {}), [suggestionIndex]: 'revert' },
      updated_at: Date.now(),
    });
  }

  private static async updateTagSuggestionStatus(
    recordId: string,
    suggestionIndex: number,
    status: 'applied' | 'superseded' | 'failed' | 'reverted',
  ): Promise<void> {
    const record = await LocalPubchiRecordService.getTagApplication(recordId);
    if (!record) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Stored Pubchi tag suggestion is missing', {
        service: ErrorService.Pubchi,
        operation: 'updateTagSuggestionStatus',
      });
    }
    await LocalPubchiRecordService.updateTagApplication(recordId, {
      statuses: { ...(record.statuses ?? {}), [suggestionIndex]: status },
      updated_at: Date.now(),
    });
  }

  static async rehydrateTagSuggestionStatuses(recordId: string, owner: string): Promise<Record<number, string>> {
    const record = await LocalPubchiRecordService.getTagApplication(recordId);
    const binding = record ? tagApplicationBinding(record) : undefined;
    if (!record || !binding || record.owner !== owner) return {};
    const statuses = { ...(record.statuses ?? {}) };
    for (const [index, suggestion] of (binding.response.tag_suggestions ?? []).entries()) {
      if (statuses[index] !== 'proposed') continue;
      try {
        const applicationId = await this.tagSuggestionApplicationId(binding, suggestion.label);
        const receipt = await this.readTagSuggestionReceipt(binding, applicationId);
        if (receipt?.status === 'applying') {
          statuses[index] = 'applying';
          await LocalPubchiRecordService.updateTagApplication(recordId, {
            statuses,
            operations: { ...(record.operations ?? {}), [index]: 'apply' },
            already_existed: { ...(record.already_existed ?? {}), [index]: null },
            tag_document_sha256: { ...(record.tag_document_sha256 ?? {}), [index]: null },
            updated_at: Date.now(),
          });
        }
      } catch {}
    }
    return statuses;
  }

  static async reconcileTagSuggestionApplication(
    recordId: string,
    suggestionIndex: number,
    owner: string,
  ): Promise<'proposed' | 'applying' | 'applied' | 'superseded' | 'failed' | 'reverted' | 'reconciliation-pending'> {
    const record = await LocalPubchiRecordService.getTagApplication(recordId);
    const binding = record ? tagApplicationBinding(record) : undefined;
    if (!record || !binding || binding.owner !== owner) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion cannot be reconciled', {
        service: ErrorService.Pubchi,
        operation: 'reconcileTagSuggestionApplication',
      });
    }
    if (this.tagSuggestionOperationsInFlight.has(`${recordId}:${suggestionIndex}`)) {
      return record.statuses?.[suggestionIndex] ?? 'reconciliation-pending';
    }
    const suggestion = binding.response.tag_suggestions?.[suggestionIndex];
    if (!suggestion) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion is missing', {
        service: ErrorService.Pubchi,
        operation: 'reconcileTagSuggestionApplication',
      });
    }
    const target = /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/(?:posts\/([^/]+)|profile\.json)$/.exec(binding.target.uri);
    if (!target)
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Invalid tag suggestion target', {
        service: ErrorService.Pubchi,
        operation: 'reconcileTagSuggestionApplication',
      });
    const tag = TagNormalizer.from({
      taggedKind: binding.target.kind === 'post' ? TagKind.POST : TagKind.USER,
      taggedId: binding.target.kind === 'post' ? `${target[1]}:${target[2]}` : target[1],
      label: suggestion.label,
      taggerId: binding.owner,
    });
    try {
      const applicationId = await this.tagSuggestionApplicationId(binding, suggestion.label);
      const receipt = await this.readTagSuggestionReceipt(binding, applicationId);
      if (!receipt)
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion receipt is missing', {
          service: ErrorService.Pubchi,
          operation: 'validatePubchiState',
        });
      const tagState = await this.readTagSuggestionPublicTag(tag.tagUrl, tag.tagJson);
      const operation = record.operations?.[suggestionIndex] ?? 'apply';
      const receiptStatus = receipt.status;

      const alreadyExisted = record.already_existed?.[suggestionIndex];
      const reconciled = reconcileTagSuggestionState({
        receiptStatus: receiptStatus as TagSuggestionReceiptStatus,
        tagState,
        operation,
        alreadyExisted,
        reportOutsideRemoval: false,
      });
      if (reconciled.status === 'reconciliation-pending') {
        await this.markTagSuggestionReconciliationPending(recordId, suggestionIndex);
        return 'reconciliation-pending';
      }
      if (reconciled.status === 'reverted-outside')
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Unexpected outside-removal state', {
          service: ErrorService.Pubchi,
          operation: 'validatePubchiState',
        });
      if (reconciled.receiptStatus) {
        await this.finalizeTagSuggestionApplication(
          recordId,
          suggestionIndex,
          applicationId,
          reconciled.receiptStatus,
          tag.tagUrl,
          alreadyExisted,
        );
      } else {
        await this.updateTagSuggestionStatus(recordId, suggestionIndex, reconciled.status);
      }
      return reconciled.status;
    } catch {
      await this.markTagSuggestionReconciliationPending(recordId, suggestionIndex);
      return 'reconciliation-pending';
    }
  }

  private static async tagSuggestionApplicationId(
    binding: NonNullable<ReturnType<typeof tagApplicationBinding>>,
    label: string,
  ): Promise<string> {
    return sha256Hex(
      canonicalJson({ owner: binding.owner, run_id: binding.response.run_id, target_uri: binding.target.uri, label }),
    );
  }

  static async prepareTagSuggestionRevert(recordId: string, suggestionIndex: number, owner: string) {
    const record = await LocalPubchiRecordService.getTagApplication(recordId);
    const binding = record ? tagApplicationBinding(record) : undefined;
    if (!record || !binding || record.owner !== owner || record.statuses?.[suggestionIndex] !== 'applied') {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion cannot be reverted', {
        service: ErrorService.Pubchi,
        operation: 'prepareTagSuggestionRevert',
      });
    }
    const suggestion = binding.response.tag_suggestions?.[suggestionIndex];
    if (!suggestion) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion is missing', {
        service: ErrorService.Pubchi,
        operation: 'prepareTagSuggestionRevert',
      });
    }
    const applicationId = await sha256Hex(
      canonicalJson({
        owner: binding.owner,
        run_id: binding.response.run_id,
        target_uri: binding.target.uri,
        label: suggestion.label,
      }),
    );
    const receipt = await this.readTagSuggestionReceipt(binding, applicationId);
    const target = /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/(?:posts\/([^/]+)|profile\.json)$/.exec(binding.target.uri);
    const tag = target
      ? TagNormalizer.from({
          taggedKind: binding.target.kind === 'post' ? TagKind.POST : TagKind.USER,
          taggedId: binding.target.kind === 'post' ? `${target[1]}:${target[2]}` : target[1],
          label: suggestion.label,
          taggerId: binding.owner,
        })
      : undefined;
    const tagDocumentSha256 = receipt?.tag_document_sha256;
    if (
      !receipt ||
      !tag ||
      receipt.status !== 'applied' ||
      receipt.already_existed !== false ||
      receipt.owner !== binding.owner ||
      receipt.bot !== binding.bot ||
      receipt.application_id !== applicationId ||
      receipt.run_id !== binding.response.run_id ||
      receipt.target.kind !== binding.target.kind ||
      receipt.target.uri !== binding.target.uri ||
      receipt.target.snapshot_sha256 !== binding.response.target?.snapshot_sha256 ||
      receipt.label !== suggestion.label ||
      receipt.suggestion_sha256 !== (await sha256Hex(canonicalJson(suggestion))) ||
      receipt.tag_uri !== tag.tagUrl ||
      typeof tagDocumentSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(tagDocumentSha256) ||
      (record.tag_document_sha256?.[suggestionIndex] != null &&
        record.tag_document_sha256[suggestionIndex] !== tagDocumentSha256)
    ) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion receipt cannot be reverted', {
        service: ErrorService.Pubchi,
        operation: 'prepareTagSuggestionRevert',
      });
    }
    return { binding, applicationId, suggestion, tagDocumentSha256 };
  }

  static async discoverTagSuggestions(
    owner: string,
    targetUri: string,
    isCurrent: () => boolean = () => true,
    liveRecordId?: string,
  ): Promise<DiscoveredTagSuggestion[]> {
    const liveIds = new Set<string>();
    const liveRecord = liveRecordId ? await LocalPubchiRecordService.getTagApplication(liveRecordId) : undefined;
    if (liveRecord) {
      const binding = tagApplicationBinding(liveRecord);
      if (binding?.target.uri === targetUri) {
        for (const suggestion of binding.response.tag_suggestions ?? []) {
          liveIds.add(await this.tagSuggestionApplicationId(binding, suggestion.label));
          if (!isCurrent()) return [];
        }
      }
    }
    if (!isCurrent()) return [];
    const directory = `pubky://${owner}${PUBCHI_PRIVATE_DIRECTORY}tag-applications/`;
    const files = (await HomeserverService.list({ baseDirectory: directory, limit: 50 })).slice(0, 50);
    const discovered: Array<DiscoveredTagSuggestion | undefined> = new Array(files.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(4, files.length) }, async () => {
      for (;;) {
        if (!isCurrent()) return;
        const index = next++;
        const file = files[index];
        if (!file) return;
        const match = file.match(
          new RegExp(
            `^pubky://${owner}${PUBCHI_PRIVATE_DIRECTORY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}tag-applications/([a-f0-9]{64})\\.json$`,
          ),
        );
        if (!match) continue;
        if (liveIds.has(match[1])) continue;
        try {
          const raw = await HomeserverService.requestRawText(file);
          if (!isCurrent()) return;
          if (new TextEncoder().encode(raw).byteLength > 64 * 1024) continue;
          const parsed = parsePubchiTagApplication(JSON.parse(raw));
          if (
            !parsed.ok ||
            parsed.value.owner !== owner ||
            parsed.value.target.uri !== targetUri ||
            parsed.value.application_id !== match[1]
          )
            continue;
          const receipt = parsed.value;
          if (liveIds.has(receipt.application_id)) continue;
          const targetMatch =
            receipt.target.kind === 'post'
              ? /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/posts\/([^/]+)$/.exec(receipt.target.uri)
              : /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/profile\.json$/.exec(receipt.target.uri);
          if (!targetMatch) continue;
          const tag = TagNormalizer.from({
            taggedKind: receipt.target.kind === 'post' ? TagKind.POST : TagKind.USER,
            taggedId: receipt.target.kind === 'post' ? `${targetMatch[1]}:${targetMatch[2]}` : targetMatch[1],
            label: receipt.label,
            taggerId: owner,
          });
          const tagState = await this.readTagSuggestionPublicTag(tag.tagUrl, tag.tagJson);
          if (!isCurrent()) return;
          const { status } = reconcileTagSuggestionState({
            receiptStatus: receipt.status,
            tagState,
            operation: 'apply',
            alreadyExisted: receipt.already_existed,
            reportOutsideRemoval: true,
          });
          discovered[index] = {
            applicationId: receipt.application_id,
            owner: receipt.owner,
            target: receipt.target,
            label: receipt.label,
            status,
            alreadyExisted: receipt.already_existed ?? null,
          };
        } catch {}
      }
    });
    await Promise.all(workers);
    return discovered.filter((suggestion): suggestion is DiscoveredTagSuggestion => suggestion !== undefined);
  }

  static async prepareDiscoveredTagSuggestionRevert(owner: string, targetUri: string, applicationId: string) {
    const receipt = await this.readDiscoveredTagSuggestionReceipt(owner, applicationId);
    const tagDocumentSha256 = receipt.tag_document_sha256;
    if (
      receipt.owner !== owner ||
      receipt.target.uri !== targetUri ||
      receipt.application_id !== applicationId ||
      receipt.status !== 'applied' ||
      receipt.already_existed !== false ||
      typeof tagDocumentSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(tagDocumentSha256)
    ) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt cannot be reverted', {
        service: ErrorService.Pubchi,
        operation: 'validatePubchiState',
      });
    }
    const tagParams = this.discoveredTagSuggestionParams(receipt);
    const tag = TagNormalizer.from(tagParams);
    if (receipt.tag_uri !== tag.tagUrl)
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt tag URI is not canonical', {
        service: ErrorService.Pubchi,
        operation: 'validatePubchiState',
      });
    if ((await this.readTagSuggestionPublicTag(tag.tagUrl, tag.tagJson)) !== 'present-canonical')
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt tag is not canonical', {
        service: ErrorService.Pubchi,
        operation: 'validatePubchiState',
      });
    return { receipt, tagParams, tagDocumentSha256 };
  }

  static async finalizeDiscoveredTagSuggestionRevert(
    owner: string,
    targetUri: string,
    applicationId: string,
    expectedReceipt: PubchiTagApplication,
    isCurrent: () => boolean = () => true,
  ): Promise<DiscoveredTagSuggestion | undefined> {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return retryHomeserverWriteAfterReread(fence, async () => {
      if (!isCurrent()) return undefined;
      const receipt = await this.readDiscoveredTagSuggestionReceipt(owner, applicationId);
      if (!isCurrent()) return undefined;
      if (
        receipt.owner !== owner ||
        receipt.target.uri !== targetUri ||
        receipt.application_id !== applicationId ||
        receipt.status !== 'applied' ||
        receipt.already_existed !== false ||
        !this.sameDiscoveredTagSuggestionAuthority(receipt, expectedReceipt)
      )
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt cannot be finalized', {
          service: ErrorService.Pubchi,
          operation: 'validatePubchiState',
        });
      const url = `pubky://${owner}${PUBCHI_PRIVATE_DIRECTORY}tag-applications/${applicationId}.json`;
      const updated = { ...receipt, status: 'reverted' as const, reverted_at: Math.floor(Date.now() / 1000) };
      if (new TextEncoder().encode(JSON.stringify(updated)).byteLength > 64 * 1024)
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt exceeds limit', {
          service: ErrorService.Pubchi,
          operation: 'validatePubchiState',
        });
      if (!isCurrent()) return undefined;
      await HomeserverService.request({ fence, method: HttpMethod.PUT, url, bodyJson: updated });
      return this.toDiscoveredTagSuggestion(updated, 'reverted');
    });
  }

  static async reconcileDiscoveredTagSuggestion(
    owner: string,
    targetUri: string,
    applicationId: string,
    isCurrent: () => boolean = () => true,
  ): Promise<DiscoveredTagSuggestion | undefined> {
    if (!isCurrent()) return undefined;
    const receipt = await this.readDiscoveredTagSuggestionReceipt(owner, applicationId);
    if (!isCurrent()) return undefined;
    if (receipt.owner !== owner || receipt.target.uri !== targetUri || receipt.application_id !== applicationId)
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt cannot be reconciled', {
        service: ErrorService.Pubchi,
        operation: 'validatePubchiState',
      });
    const tag = TagNormalizer.from(this.discoveredTagSuggestionParams(receipt));
    const tagState = await this.readTagSuggestionPublicTag(tag.tagUrl, tag.tagJson);
    if (!isCurrent()) return undefined;
    const reconciled = reconcileTagSuggestionState({
      receiptStatus: receipt.status,
      tagState,
      operation: 'apply',
      alreadyExisted: receipt.already_existed,
      reportOutsideRemoval: true,
    });
    if (!reconciled.receiptStatus) return this.toDiscoveredTagSuggestion(receipt, reconciled.status);
    return this.writeDiscoveredTagSuggestionStatus(
      owner,
      targetUri,
      applicationId,
      reconciled.receiptStatus,
      receipt,
      isCurrent,
    );
  }

  private static async writeDiscoveredTagSuggestionStatus(
    owner: string,
    targetUri: string,
    applicationId: string,
    status: Exclude<TagSuggestionReceiptStatus, 'applying'>,
    expectedReceipt: PubchiTagApplication,
    isCurrent: () => boolean,
  ): Promise<DiscoveredTagSuggestion | undefined> {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return retryHomeserverWriteAfterReread(fence, async () => {
      if (!isCurrent()) return undefined;
      const receipt = await this.readDiscoveredTagSuggestionReceipt(owner, applicationId);
      if (!isCurrent()) return undefined;
      if (
        receipt.owner !== owner ||
        receipt.target.uri !== targetUri ||
        receipt.application_id !== applicationId ||
        !this.sameDiscoveredTagSuggestionAuthority(receipt, expectedReceipt)
      )
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt changed during reconciliation', {
          service: ErrorService.Pubchi,
          operation: 'validatePubchiState',
        });
      const updated = { ...receipt, status };
      if (new TextEncoder().encode(JSON.stringify(updated)).byteLength > 64 * 1024)
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt exceeds limit', {
          service: ErrorService.Pubchi,
          operation: 'validatePubchiState',
        });
      if (!isCurrent()) return undefined;
      await HomeserverService.request({
        fence,
        method: HttpMethod.PUT,
        url: `pubky://${owner}${PUBCHI_PRIVATE_DIRECTORY}tag-applications/${applicationId}.json`,
        bodyJson: updated,
      });
      return this.toDiscoveredTagSuggestion(updated, status);
    });
  }

  private static async readDiscoveredTagSuggestionReceipt(
    owner: string,
    applicationId: string,
  ): Promise<PubchiTagApplication> {
    const url = `pubky://${owner}${PUBCHI_PRIVATE_DIRECTORY}tag-applications/${applicationId}.json`;
    const raw = await HomeserverService.requestRawText(url);
    if (new TextEncoder().encode(raw).byteLength > 64 * 1024)
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt exceeds limit', {
        service: ErrorService.Pubchi,
        operation: 'validatePubchiState',
      });
    const parsed = parsePubchiTagApplication(JSON.parse(raw));
    if (!parsed.ok)
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt is invalid', {
        service: ErrorService.Pubchi,
        operation: 'validatePubchiState',
      });
    return parsed.value;
  }

  private static discoveredTagSuggestionParams(receipt: PubchiTagApplication) {
    const match = /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/posts\/([^/]+)$/.exec(receipt.target.uri);
    if (!match || receipt.target.kind !== 'post')
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Receipt target is invalid', {
        service: ErrorService.Pubchi,
        operation: 'validatePubchiState',
      });
    return {
      taggedKind: TagKind.POST,
      taggedId: `${match[1]}:${match[2]}`,
      label: receipt.label,
      taggerId: receipt.owner,
    };
  }

  private static sameDiscoveredTagSuggestionAuthority(
    receipt: PubchiTagApplication,
    expected: PubchiTagApplication,
  ): boolean {
    return (
      receipt.owner === expected.owner &&
      receipt.bot === expected.bot &&
      receipt.application_id === expected.application_id &&
      receipt.run_id === expected.run_id &&
      receipt.target.kind === expected.target.kind &&
      receipt.target.uri === expected.target.uri &&
      receipt.target.snapshot_sha256 === expected.target.snapshot_sha256 &&
      receipt.label === expected.label &&
      receipt.suggestion_sha256 === expected.suggestion_sha256 &&
      receipt.status === expected.status &&
      receipt.already_existed === expected.already_existed &&
      receipt.tag_uri === expected.tag_uri &&
      receipt.tag_document_sha256 === expected.tag_document_sha256
    );
  }

  private static toDiscoveredTagSuggestion(
    receipt: PubchiTagApplication,
    status: DiscoveredTagSuggestion['status'],
  ): DiscoveredTagSuggestion {
    return {
      applicationId: receipt.application_id,
      owner: receipt.owner,
      target: receipt.target,
      label: receipt.label,
      status,
      alreadyExisted: receipt.already_existed ?? null,
    };
  }

  private static async readTagSuggestionReceipt(
    binding: NonNullable<ReturnType<typeof tagApplicationBinding>>,
    applicationId: string,
  ): Promise<PubchiTagApplication | undefined> {
    const url = `pubky://${binding.owner}${PUBCHI_PRIVATE_DIRECTORY}tag-applications/${applicationId}.json`;
    try {
      const raw = await HomeserverService.requestRawText(url);
      if (raw && new TextEncoder().encode(raw).byteLength > 64 * 1024) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion receipt exceeds 64 KiB', {
          service: ErrorService.Pubchi,
          operation: 'readTagSuggestionReceipt',
        });
      }
      const response = raw ? JSON.parse(raw) : await HomeserverService.request({ method: HttpMethod.GET, url });
      const parsed = parsePubchiTagApplication(response);
      if (!parsed.ok) {
        throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Existing tag suggestion receipt is invalid', {
          service: ErrorService.Pubchi,
          operation: 'readTagSuggestionReceipt',
        });
      }
      return parsed.value;
    } catch (cause) {
      if (hasHttpStatus(cause, HttpStatusCode.NOT_FOUND)) return undefined;
      if (cause instanceof Error && 'code' in cause) throw cause;
      throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Could not read tag suggestion receipt', {
        service: ErrorService.Pubchi,
        operation: 'readTagSuggestionReceipt',
        cause,
      });
    }
  }

  private static async readTagSuggestionPublicTag(
    tagUrl: string,
    expected: Record<string, unknown>,
  ): Promise<'absent' | 'present-canonical' | 'indeterminate'> {
    try {
      const raw = await HomeserverService.requestRawText(tagUrl);
      if (new TextEncoder().encode(raw).byteLength > 64 * 1024) return 'indeterminate';
      const tag = PubkyAppTag.fromJson(JSON.parse(raw)).toJson() as Record<string, unknown>;
      return tag.uri === expected.uri && tag.label === expected.label ? 'present-canonical' : 'indeterminate';
    } catch (cause) {
      return hasHttpStatus(cause, HttpStatusCode.NOT_FOUND) ? 'absent' : 'indeterminate';
    }
  }

  private static async writeTagSuggestionReceipt(
    binding: NonNullable<ReturnType<typeof tagApplicationBinding>>,
    suggestionIndex: number,
    applicationId: string,
    status: 'applying' | 'applied' | 'superseded' | 'failed' | 'reverted',
    tagUri?: string,
    alreadyExisted?: boolean | null,
    tagDocumentSha256?: string | null,
  ): Promise<void> {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return retryHomeserverWriteAfterReread(fence, async () => {
      const suggestion = binding.response.tag_suggestions?.[suggestionIndex];
      if (!suggestion || !binding.response.target?.snapshot_sha256) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion receipt is incomplete', {
          service: ErrorService.Pubchi,
          operation: 'writeTagSuggestionReceipt',
        });
      }
      const url = `pubky://${binding.owner}${PUBCHI_PRIVATE_DIRECTORY}tag-applications/${applicationId}.json`;
      const existing = (await this.readTagSuggestionReceipt(binding, applicationId)) ?? {};
      const receipt = {
        ...existing,
        schema: 'pubchi-tag-application',
        version: 1,
        application_id: applicationId,
        owner: binding.owner,
        bot: binding.bot,
        run_id: binding.response.run_id,
        target: { ...binding.target, snapshot_sha256: binding.response.target.snapshot_sha256 },
        label: suggestion.label,
        source: suggestion.source,
        evidence: suggestion.evidence,
        suggestion_sha256: await sha256Hex(canonicalJson(suggestion)),
        status,
        ...(status === 'applying'
          ? { tag_document_sha256: null }
          : tagDocumentSha256
            ? { tag_document_sha256: tagDocumentSha256 }
            : {}),
        ...(status === 'applying'
          ? { already_existed: null }
          : alreadyExisted !== undefined
            ? { already_existed: alreadyExisted }
            : {}),
        suggested_at: binding.response.generated_at,
        ...(tagUri ? { tag_uri: tagUri } : {}),
        ...(status === 'applied' ? { applied_at: Math.floor(Date.now() / 1000) } : {}),
        ...(status === 'reverted' ? { reverted_at: Math.floor(Date.now() / 1000) } : {}),
      };
      if (new TextEncoder().encode(JSON.stringify(receipt)).byteLength > 64 * 1024) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag suggestion receipt exceeds 64 KiB', {
          service: ErrorService.Pubchi,
          operation: 'writeTagSuggestionReceipt',
        });
      }
      await HomeserverService.request({ fence, method: HttpMethod.PUT, url, bodyJson: receipt });
    });
  }

  static async prepareDraftPostApplication(recordId: string, owner: string, capabilities: string[]) {
    const record = await LocalPubchiRecordService.getDraftPost(recordId);
    const binding = record ? draftPostBinding(record) : undefined;
    if (
      !record ||
      !binding ||
      record.owner !== owner ||
      (record.status !== 'proposed' && record.status !== 'failed') ||
      (record.composite_post_id !== undefined && !record.publication_confirmed) ||
      !canPublishDraftPost(binding, { info: { capabilities } })
    ) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post is no longer applicable', {
        service: ErrorService.Pubchi,
        operation: 'prepareDraftPostApplication',
      });
    }
    const responseSha256 = await sha256Hex(canonicalJson(record.response));
    if (responseSha256 !== record.response_sha256 || record.response_run_id !== binding.response.run_id) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Stored Pubchi draft post response is invalid', {
        service: ErrorService.Pubchi,
        operation: 'prepareDraftPostApplication',
      });
    }
    const draft = binding.response.draft_post;
    if (!draft) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post is missing', {
        service: ErrorService.Pubchi,
        operation: 'prepareDraftPostApplication',
      });
    }
    const applicationId = await this.draftPostApplicationId(binding);
    await this.writeDraftPostReceipt(binding, applicationId, 'applying');
    await LocalPubchiRecordService.updateDraftPost(recordId, {
      status: 'applying',
      operation: 'apply',
      updated_at: Date.now(),
    });
    return {
      binding,
      applicationId,
      draft,
      existingCompositePostId: record.composite_post_id,
      existingPostUri: record.post_uri,
    };
  }

  static async prepareDraftPostReject(recordId: string, owner: string, capabilities: string[]) {
    const record = await LocalPubchiRecordService.getDraftPost(recordId);
    const binding = record ? draftPostBinding(record) : undefined;
    if (
      !record ||
      !binding ||
      record.owner !== owner ||
      (record.status !== 'proposed' && record.status !== 'failed') ||
      !canRejectDraftPost(binding, { info: { capabilities } })
    ) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post cannot be rejected', {
        service: ErrorService.Pubchi,
        operation: 'prepareDraftPostReject',
      });
    }
    const responseSha256 = await sha256Hex(canonicalJson(record.response));
    if (responseSha256 !== record.response_sha256 || record.response_run_id !== binding.response.run_id) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Stored Pubchi draft post response is invalid', {
        service: ErrorService.Pubchi,
        operation: 'prepareDraftPostReject',
      });
    }
    const applicationId = await this.draftPostApplicationId(binding);
    await this.writeDraftPostReceipt(binding, applicationId, 'rejected');
    await LocalPubchiRecordService.updateDraftPost(recordId, {
      status: 'rejected',
      operation: 'reject',
      updated_at: Date.now(),
    });
    return { binding, applicationId };
  }

  static async prepareDraftPostRevert(recordId: string, owner: string) {
    const record = await LocalPubchiRecordService.getDraftPost(recordId);
    const binding = record ? draftPostBinding(record) : undefined;
    if (
      !record ||
      !binding ||
      record.owner !== owner ||
      record.status !== 'applied' ||
      !record.composite_post_id ||
      !record.publication_confirmed
    ) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post cannot be reverted', {
        service: ErrorService.Pubchi,
        operation: 'prepareDraftPostRevert',
      });
    }
    const applicationId = await this.draftPostApplicationId(binding);
    const receipt = await this.readDraftPostReceipt(binding, applicationId);
    const expectedUri = `pubky://${owner}/pub/pubky.app/posts/${record.composite_post_id.slice(owner.length + 1)}`;
    if (
      !record.composite_post_id.startsWith(`${owner}:`) ||
      !receipt ||
      receipt.status !== 'applied' ||
      receipt.post_uri !== expectedUri ||
      record.post_uri !== expectedUri
    ) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post receipt cannot be reverted', {
        service: ErrorService.Pubchi,
        operation: 'prepareDraftPostRevert',
      });
    }
    return { binding, applicationId, compositePostId: record.composite_post_id };
  }

  static async finalizeDraftPostApplication(
    recordId: string,
    applicationId: string,
    status: 'applied' | 'failed' | 'reverted' | 'rejected',
    postUri?: string,
    compositePostId?: string,
  ): Promise<void> {
    const record = await LocalPubchiRecordService.getDraftPost(recordId);
    const binding = record ? draftPostBinding(record) : undefined;
    if (!record || !binding) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Stored Pubchi draft post is missing', {
        service: ErrorService.Pubchi,
        operation: 'finalizeDraftPostApplication',
      });
    }
    await this.writeDraftPostReceipt(binding, applicationId, status, postUri);
    await LocalPubchiRecordService.updateDraftPost(recordId, {
      status,
      ...(postUri ? { post_uri: postUri } : {}),
      ...(compositePostId ? { composite_post_id: compositePostId } : {}),
      updated_at: Date.now(),
    });
  }

  static async markDraftPostReconciliationPending(recordId: string): Promise<void> {
    const record = await LocalPubchiRecordService.getDraftPost(recordId);
    if (!record) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Stored Pubchi draft post is missing', {
        service: ErrorService.Pubchi,
        operation: 'markDraftPostReconciliationPending',
      });
    }
    await LocalPubchiRecordService.updateDraftPost(recordId, {
      status: 'reconciliation-pending',
      updated_at: Date.now(),
    });
  }

  static async recordDraftPostApplyOutcome(recordId: string, compositePostId: string, postUri: string): Promise<void> {
    const record = await LocalPubchiRecordService.getDraftPost(recordId);
    if (!record) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Stored Pubchi draft post is missing', {
        service: ErrorService.Pubchi,
        operation: 'recordDraftPostApplyOutcome',
      });
    }
    await LocalPubchiRecordService.updateDraftPost(recordId, {
      operation: 'apply',
      composite_post_id: compositePostId,
      publication_confirmed: true,
      post_uri: postUri,
      updated_at: Date.now(),
    });
  }

  static async recordDraftPostRevertOperation(recordId: string): Promise<void> {
    const record = await LocalPubchiRecordService.getDraftPost(recordId);
    if (!record) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Stored Pubchi draft post is missing', {
        service: ErrorService.Pubchi,
        operation: 'recordDraftPostRevertOperation',
      });
    }
    await LocalPubchiRecordService.updateDraftPost(recordId, {
      operation: 'revert',
      updated_at: Date.now(),
    });
  }

  static async rehydrateDraftPostStatus(recordId: string, owner: string): Promise<string | undefined> {
    const record = await LocalPubchiRecordService.getDraftPost(recordId);
    const binding = record ? draftPostBinding(record) : undefined;
    if (!record || !binding || record.owner !== owner) return undefined;
    if (record.status !== 'proposed') return record.status;
    try {
      const applicationId = await this.draftPostApplicationId(binding);
      const receipt = await this.readDraftPostReceipt(binding, applicationId);
      if (receipt?.status === 'applying' || receipt?.status === 'rejected') {
        await LocalPubchiRecordService.updateDraftPost(recordId, {
          status: receipt.status,
          operation: receipt.status === 'rejected' ? 'reject' : 'apply',
          updated_at: Date.now(),
        });
        return receipt.status;
      }
    } catch {}
    return record.status;
  }

  static async reconcileDraftPostApplication(
    recordId: string,
    owner: string,
  ): Promise<'proposed' | 'applying' | 'applied' | 'failed' | 'reverted' | 'rejected' | 'reconciliation-pending'> {
    const record = await LocalPubchiRecordService.getDraftPost(recordId);
    const binding = record ? draftPostBinding(record) : undefined;
    if (!record || !binding || binding.owner !== owner) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post cannot be reconciled', {
        service: ErrorService.Pubchi,
        operation: 'reconcileDraftPostApplication',
      });
    }
    if (this.draftPostOperationsInFlight.has(recordId)) {
      return record.status;
    }
    try {
      const applicationId = await this.draftPostApplicationId(binding);
      const receipt = await this.readDraftPostReceipt(binding, applicationId);
      if (!receipt)
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post receipt is missing', {
          service: ErrorService.Pubchi,
          operation: 'validatePubchiState',
        });
      if (
        (receipt.status === 'applying' || receipt.status === 'applied') &&
        (!record.publication_confirmed || !record.composite_post_id)
      ) {
        await this.markDraftPostReconciliationPending(recordId);
        return 'reconciliation-pending';
      }
      const postUri = record.post_uri;
      if (receipt.post_uri && receipt.post_uri !== postUri) {
        await this.markDraftPostReconciliationPending(recordId);
        return 'reconciliation-pending';
      }
      const postState = postUri ? await this.readDraftPostPublicPost(postUri) : 'absent';
      const reconciled = reconcileDraftPostState({
        receiptStatus: receipt.status as DraftPostReceiptStatus,
        postState,
        operation: record.operation ?? 'apply',
      });
      if (reconciled.status === 'reconciliation-pending') {
        await this.markDraftPostReconciliationPending(recordId);
        return 'reconciliation-pending';
      }
      if (reconciled.receiptStatus) {
        await this.finalizeDraftPostApplication(
          recordId,
          applicationId,
          reconciled.receiptStatus,
          postUri,
          record.composite_post_id,
        );
      } else {
        await LocalPubchiRecordService.updateDraftPost(recordId, {
          status: reconciled.status,
          updated_at: Date.now(),
        });
      }
      return reconciled.status;
    } catch {
      await this.markDraftPostReconciliationPending(recordId);
      return 'reconciliation-pending';
    }
  }

  private static async draftPostApplicationId(
    binding: NonNullable<ReturnType<typeof draftPostBinding>>,
  ): Promise<string> {
    const draft = binding.response.draft_post;
    const draftSha256 = await sha256Hex(canonicalJson(draft));
    return sha256Hex(
      canonicalJson({ owner: binding.owner, run_id: binding.response.run_id, draft_sha256: draftSha256 }),
    );
  }

  private static async readDraftPostReceipt(
    binding: NonNullable<ReturnType<typeof draftPostBinding>>,
    applicationId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const url = `pubky://${binding.owner}${PUBCHI_PRIVATE_DIRECTORY}draft-posts/${applicationId}.json`;
    try {
      const raw = await HomeserverService.requestRawText(url);
      if (raw && new TextEncoder().encode(raw).byteLength > 64 * 1024) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post receipt exceeds 64 KiB', {
          service: ErrorService.Pubchi,
          operation: 'readDraftPostReceipt',
        });
      }
      const response = raw ? JSON.parse(raw) : await HomeserverService.request({ method: HttpMethod.GET, url });
      const parsed = parsePubchiDraftPostReceipt(response);
      if (!parsed.ok) {
        throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Existing draft post receipt is invalid', {
          service: ErrorService.Pubchi,
          operation: 'readDraftPostReceipt',
        });
      }
      if (
        parsed.value.application_id !== applicationId ||
        parsed.value.owner !== binding.owner ||
        parsed.value.bot !== binding.bot ||
        parsed.value.run_id !== binding.response.run_id ||
        parsed.value.draft_sha256 !== (await sha256Hex(canonicalJson(binding.response.draft_post)))
      ) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post receipt does not match this operation', {
          service: ErrorService.Pubchi,
          operation: 'readDraftPostReceipt',
        });
      }
      return parsed.value as Record<string, unknown>;
    } catch (cause) {
      if (hasHttpStatus(cause, HttpStatusCode.NOT_FOUND)) return undefined;
      if (cause instanceof Error && 'code' in cause) throw cause;
      throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Could not read draft post receipt', {
        service: ErrorService.Pubchi,
        operation: 'readDraftPostReceipt',
        cause,
      });
    }
  }

  private static async readDraftPostPublicPost(postUri: string): Promise<DraftPostPublicState> {
    try {
      const raw = await HomeserverService.requestRawText(postUri);
      if (new TextEncoder().encode(raw).byteLength > 64 * 1024) return 'indeterminate';
      JSON.parse(raw);
      return 'present';
    } catch (cause) {
      return hasHttpStatus(cause, HttpStatusCode.NOT_FOUND) ? 'absent' : 'indeterminate';
    }
  }

  private static async writeDraftPostReceipt(
    binding: NonNullable<ReturnType<typeof draftPostBinding>>,
    applicationId: string,
    status: DraftPostReceiptStatus,
    postUri?: string,
  ): Promise<void> {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return retryHomeserverWriteAfterReread(fence, async () => {
      const draft = binding.response.draft_post;
      if (!draft) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post receipt is incomplete', {
          service: ErrorService.Pubchi,
          operation: 'writeDraftPostReceipt',
        });
      }
      const url = `pubky://${binding.owner}${PUBCHI_PRIVATE_DIRECTORY}draft-posts/${applicationId}.json`;
      const existing = (await this.readDraftPostReceipt(binding, applicationId)) ?? {};
      const now = Math.floor(Date.now() / 1000);
      const receiptBase = {
        ...existing,
        schema: 'pubchi-draft-post',
        version: 1,
        application_id: applicationId,
        owner: binding.owner,
        bot: binding.bot,
        run_id: binding.response.run_id,
        draft_sha256: await sha256Hex(canonicalJson(draft)),
        kind: draft.kind,
        ...(draft.tags ? { tags: draft.tags } : {}),
        ...(draft.parent_uri ? { parent_uri: draft.parent_uri } : {}),
        rationale: draft.rationale,
        evidence: draft.evidence,
        status,
        suggested_at: binding.response.generated_at,
        ...(postUri ? { post_uri: postUri } : {}),
        ...(status === 'applied' ? { applied_at: now } : {}),
        ...(status === 'reverted' ? { reverted_at: now } : {}),
        ...(status === 'rejected' ? { rejected_at: now } : {}),
      };
      const content = truncateDraftPostReceiptContent(receiptBase, draft.content);
      if (!content) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post receipt exceeds 64 KiB', {
          service: ErrorService.Pubchi,
          operation: 'writeDraftPostReceipt',
        });
      }
      const receipt = { ...receiptBase, content };
      if (new TextEncoder().encode(JSON.stringify(receipt)).byteLength > DRAFT_POST_RECEIPT_MAX_BYTES) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post receipt exceeds 64 KiB', {
          service: ErrorService.Pubchi,
          operation: 'writeDraftPostReceipt',
        });
      }
      await HomeserverService.request({ fence, method: HttpMethod.PUT, url, bodyJson: receipt });
    });
  }

  static async query(params: PubchiQueryApplicationParams): Promise<PubchiQuerySuccess> {
    if (!isPubchiPanelEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'query',
      });
    }

    const assertCurrent = () => {
      params.signal?.throwIfAborted();
      assertQueryCurrent(params.isCurrent);
    };
    assertCurrent();
    const binding = await LocalPubchiBindingService.readActive(params.owner);
    assertCurrent();
    if (!binding || binding.status !== 'active') {
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'BOT_MISMATCH', {
        service: ErrorService.Pubchi,
        operation: 'query',
        context: { pubchiCode: 'BOT_MISMATCH' },
      });
    }
    const question = params.question.trim();
    if (!question) {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'REQUEST_MALFORMED', {
        service: ErrorService.Pubchi,
        operation: 'query',
        context: { pubchiCode: 'REQUEST_MALFORMED' },
      });
    }
    if (question.length > PUBCHI_QUESTION_MAX_LENGTH) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'REQUEST_MALFORMED', {
        service: ErrorService.Pubchi,
        operation: 'query',
        context: { pubchiCode: 'REQUEST_MALFORMED' },
      });
    }

    const purpose = params.purpose;
    if (!pubchiEndpointFor(purpose) || !['ask', 'who-tagged-me', 'build-feed'].includes(purpose)) {
      throw pubchiValidationError('PURPOSE_UNSUPPORTED', 'query');
    }
    const servedPurpose = purpose as 'ask' | 'who-tagged-me' | 'build-feed';

    const body: PubchiAskBody = {
      question,
      ...(servedPurpose === 'ask' && params.conversation ? { conversation: params.conversation } : {}),
      ...(params.proposalVersion ? { proposal_version: params.proposalVersion } : {}),
      ...(params.targetFeedId ? { target_feed_id: params.targetFeedId } : {}),
      ...(params.currentFeed ? { current_feed: params.currentFeed } : {}),
      ...(params.target ? { target: params.target } : {}),
    };
    const submittedAt = Date.now();
    if (body.conversation) {
      const parsedConversation = parseConversation(body.conversation);
      if (!parsedConversation.ok) throw pubchiValidationError(parsedConversation.code, 'query');
    }
    const issuedAt = params.nowSeconds ?? Math.floor(Date.now() / 1000);
    const unsigned: UnsignedRequestObjectV2 = {
      schema: 'pubchi-request-object-v2',
      version: 2,
      audience: getPubchiAudience(),
      asker: params.owner,
      bot: binding.bot,
      key_generation: binding.key_generation ?? 1,
      purpose: servedPurpose,
      body_sha256: await bodySha256(body),
      issued_at: issuedAt,
      expires_at: issuedAt + REQUEST_TTL_SECONDS,
      nonce: randomNonce(),
      ...(servedPurpose === 'who-tagged-me' || !params.context ? {} : { context: contextForRequest(params.context) }),
    };
    assertCurrent();
    const device = await getCurrentDeviceKey(params.owner, issuedAt);
    assertCurrent();
    if (!device) throw pubchiValidationError('SIGNATURE_INVALID', 'query');
    const request = await signRequestObjectV2({ ...unsigned, signer: device.signer }, device.key);
    assertCurrent();
    assertRequestSignerIsStoredDevice(request.signer, device.signer);

    const response = await PubchiService.query({ request, body }, params.signal);
    assertCurrent();
    const interpreted = interpretQueryResponse(response);
    if (interpreted.kind !== 'answer') return interpreted;
    if (servedPurpose === 'ask' && interpreted.result.section === 'draft_post' && interpreted.result.draft_post) {
      return this.persistDraftPostQuery(
        params.owner,
        binding.bot,
        body.question,
        submittedAt,
        interpreted.result,
        assertCurrent,
        params.signal,
      );
    }
    if (servedPurpose !== 'ask' || !body.target) return interpreted;
    const responseBinding = {
      owner: params.owner,
      bot: binding.bot,
      servedPurpose: 'ask' as const,
      question: body.question,
      target: body.target,
      submitted_at: submittedAt,
    };
    const responseSha256 = await sha256Hex(canonicalJson(interpreted.result));
    const recordId = await sha256Hex(
      canonicalJson({ ...responseBinding, response_sha256: responseSha256, run_id: interpreted.result.run_id }),
    );
    const statuses = Object.fromEntries(
      (interpreted.result.tag_suggestions ?? []).map((suggestion, index) => [
        index,
        suggestion.already_applied ? 'superseded' : 'proposed',
      ]),
    ) as Record<number, 'proposed' | 'superseded'>;
    try {
      await LocalPubchiRecordService.putTagApplication(
        {
          id: recordId,
          owner: responseBinding.owner,
          bot: responseBinding.bot,
          served_purpose: responseBinding.servedPurpose,
          question: responseBinding.question,
          target: responseBinding.target,
          submitted_at: responseBinding.submitted_at,
          response_run_id: interpreted.result.run_id,
          response: interpreted.result,
          response_sha256: responseSha256,
          statuses,
          updated_at: Date.now(),
        },
        assertCurrent,
        params.signal,
      );
    } catch (cause) {
      if (cause instanceof AppError || (params.signal?.aborted && cause === params.signal.reason)) throw cause;
      throw Err.database(DatabaseErrorCode.TRANSACTION_FAILED, 'Could not persist Pubchi tag suggestions', {
        service: ErrorService.Pubchi,
        operation: 'query',
        cause,
      });
    }
    return {
      ...interpreted,
      binding: {
        ...responseBinding,
        recordId,
      },
    };
  }

  private static async persistDraftPostQuery(
    owner: string,
    bot: string,
    question: string,
    submittedAt: number,
    result: PubchiAnswerV1,
    assertCurrent: () => void,
    signal?: AbortSignal,
  ): Promise<PubchiQuerySuccess> {
    const responseSha256 = await sha256Hex(canonicalJson(result));
    const responseBinding = {
      owner,
      bot,
      servedPurpose: 'ask' as const,
      question,
      submitted_at: submittedAt,
    };
    const recordId = await sha256Hex(
      canonicalJson({ ...responseBinding, response_sha256: responseSha256, run_id: result.run_id }),
    );
    try {
      await LocalPubchiRecordService.putDraftPost(
        {
          id: recordId,
          owner,
          bot,
          served_purpose: 'ask',
          question,
          submitted_at: submittedAt,
          response_run_id: result.run_id,
          response: result,
          response_sha256: responseSha256,
          status: 'proposed',
          updated_at: Date.now(),
        },
        assertCurrent,
        signal,
      );
    } catch (cause) {
      if (cause instanceof AppError || (signal?.aborted && cause === signal.reason)) throw cause;
      throw Err.database(DatabaseErrorCode.TRANSACTION_FAILED, 'Could not persist Pubchi draft post', {
        service: ErrorService.Pubchi,
        operation: 'query',
        cause,
      });
    }
    return {
      kind: 'answer',
      result,
      binding: {
        ...responseBinding,
        recordId,
      },
    };
  }
}

function assertQueryCurrent(isCurrent: () => boolean): void {
  if (isCurrent()) return;
  throw Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Session ended before the Pubchi query completed.', {
    service: ErrorService.Pubchi,
    operation: 'query',
  });
}

async function putAndVerifyOwnerBinding(owner: string, candidate: OwnerBindingV1) {
  const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
  return retryHomeserverWriteAfterReread(fence, async () => {
    const url = ownerBindingUri(owner, candidate.bot);
    const current = await readOwnerBindingIfPresent(owner, candidate.bot);
    if (current && sameOwnerBinding(current, candidate)) return;
    if (current?.status === 'active') throw pubchiValidationError('SCHEMA_INVALID', 'putAndVerifyOwnerBinding');
    const root = validatePublicRootReferences(candidate);
    if (!root.ok) throw pubchiValidationError(root.code, 'putAndVerifyOwnerBinding');
    const size = validatePubchiDocumentSize(candidate);
    if (!size.ok) throw pubchiValidationError(size.code, 'putAndVerifyOwnerBinding');
    try {
      await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: candidate, fence });
    } catch (error) {
      if (!(await tryReadOwnerBinding(url, candidate))) throw error;
    }
    await readAndVerifyOwnerBinding(owner, candidate);
  });
}

async function readAndVerifyOwnerBinding(owner: string, candidate: OwnerBindingV1): Promise<void> {
  const parsed = parseOwnerBindingV1(
    await HomeserverService.request({
      method: HttpMethod.GET,
      url: ownerBindingUri(owner, candidate.bot),
    }),
  );
  if (!parsed.ok || !sameOwnerBinding(parsed.value, candidate)) {
    throw pubchiValidationError(parsed.ok ? 'SCHEMA_INVALID' : parsed.code, 'createPubchi');
  }
}

async function tryReadOwnerBinding(url: string, candidate: OwnerBindingV1): Promise<boolean> {
  try {
    const parsed = parseOwnerBindingV1(await HomeserverService.request({ method: HttpMethod.GET, url }));
    return parsed.ok && sameOwnerBinding(parsed.value, candidate);
  } catch {
    return false;
  }
}

async function putAndVerifyBot(
  owner: string,
  candidate: PubchiBotV1,
  expectedCurrent: PubchiBotV1 | undefined,
): Promise<void> {
  const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
  return retryHomeserverWriteAfterReread(fence, async () => {
    const url = botUri(owner);
    const current = await readBotIfPresent(owner);
    // A lost response can leave the requested write committed. Never overwrite it again.
    if (current && sameBot(current, candidate)) return;
    if (
      (expectedCurrent === undefined && current !== undefined) ||
      (expectedCurrent !== undefined && (!current || !sameBot(current, expectedCurrent)))
    )
      throw pubchiValidationError('SCHEMA_INVALID', 'putAndVerifyBot');
    const preservedCandidate = current ? { ...current, ...candidate } : candidate;
    const forbidden = scanForbiddenPublicState(preservedCandidate);
    if (!forbidden.ok) throw pubchiValidationError(forbidden.code, 'putAndVerifyBot');
    const root = validatePublicRootReferences(preservedCandidate);
    if (!root.ok) throw pubchiValidationError(root.code, 'putAndVerifyBot');
    const size = validatePubchiDocumentSize(preservedCandidate);
    if (!size.ok) throw pubchiValidationError(size.code, 'putAndVerifyBot');
    try {
      await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: preservedCandidate, fence });
    } catch (error) {
      if (!(await tryReadBot(url, preservedCandidate))) throw error;
    }
    const parsed = parsePubchiBotV1(await HomeserverService.request({ method: HttpMethod.GET, url }));
    if (!parsed.ok || !sameBot(parsed.value, preservedCandidate)) {
      throw pubchiValidationError(parsed.ok ? 'SCHEMA_INVALID' : parsed.code, 'createPubchi');
    }
  });
}

async function tryReadBot(url: string, candidate: PubchiBotV1): Promise<boolean> {
  try {
    const parsed = parsePubchiDocumentText(await HomeserverService.requestRawText(url), parsePubchiBotV1);
    return parsed.ok && sameBot(parsed.value, candidate);
  } catch {
    return false;
  }
}

async function readBotIfPresent(owner: string): Promise<PubchiBotV1 | undefined> {
  try {
    const parsed = parsePubchiDocumentText(await HomeserverService.requestRawText(botUri(owner)), parsePubchiBotV1);
    if (!parsed.ok || parsed.value.owner !== owner) {
      throw pubchiValidationError(parsed.ok ? 'SCHEMA_INVALID' : parsed.code, 'readBotIfPresent');
    }
    return parsed.value;
  } catch (error) {
    if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return undefined;
    throw error;
  }
}

async function readOwnerBindingIfPresent(owner: string, bot: string): Promise<OwnerBindingV1 | undefined> {
  try {
    const parsed = parseOwnerBindingV1(
      await HomeserverService.request({ method: HttpMethod.GET, url: ownerBindingUri(owner, bot) }),
    );
    if (!parsed.ok || parsed.value.owner !== owner || parsed.value.bot !== bot) {
      throw pubchiValidationError(parsed.ok ? 'SCHEMA_INVALID' : parsed.code, 'readOwnerBindingIfPresent');
    }
    return parsed.value;
  } catch (error) {
    if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return undefined;
    throw error;
  }
}

async function tombstoneUnreferencedRemoteBindings(
  owner: string,
  referencedBot: string | undefined,
  failClosed: boolean,
): Promise<void> {
  try {
    const files = await HomeserverService.listAll({ baseDirectory: ownerBindingsUri(owner) });
    for (const file of files) {
      const match = file.match(/\/bots\/([^/]+)\.json$/);
      const bot = match?.[1];
      if (!bot || !isPubkyId(bot) || bot === referencedBot) continue;
      await tombstoneBindingIfActive(owner, bot, Math.floor(Date.now() / 1000));
    }
  } catch (error) {
    if (failClosed) throw error;
  }
}

async function findLegacyActiveBinding(owner: string): Promise<OwnerBindingV1 | undefined> {
  try {
    const files = await HomeserverService.listAll({ baseDirectory: ownerBindingsUri(owner) });
    for (const file of files) {
      const match = file.match(/\/bots\/([^/]+)\.json$/);
      const bot = match?.[1];
      if (!bot || !isPubkyId(bot)) continue;
      const binding = await readOwnerBindingIfPresent(owner, bot);
      if (binding?.status === 'active' && binding.owner === owner && binding.bot === bot) return binding;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function tombstoneBindingIfActive(owner: string, bot: string, now: number): Promise<void> {
  const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
  return retryHomeserverWriteAfterReread(fence, async () => {
    const remote = await readOwnerBindingIfPresent(owner, bot);
    if (!remote || remote.status !== 'active') return;
    const url = ownerBindingUri(owner, bot);
    const tombstone = {
      ...remote,
      status: 'revoked' as const,
      updated_at: now,
    };
    const root = validatePublicRootReferences(tombstone);
    if (!root.ok) throw pubchiValidationError(root.code, 'tombstoneBindingIfActive');
    await HomeserverService.request({ fence, method: HttpMethod.PUT, url, bodyJson: tombstone });
    const verified = parseOwnerBindingV1(await HomeserverService.request({ method: HttpMethod.GET, url }));
    if (!verified.ok || !sameOwnerBinding(verified.value, tombstone)) {
      throw pubchiValidationError(verified.ok ? 'SCHEMA_INVALID' : verified.code, 'createPubchi');
    }
    await LocalPubchiBindingService.upsert({
      ...tombstone,
      id: bindingRecordId(owner, bot),
    });
  });
}

async function replaceLocalActiveBinding(binding: OwnerBindingV1, assertCurrent: () => void): Promise<void> {
  assertCurrent();
  await LocalPubchiBindingService.replaceActive(
    {
      ...binding,
      id: bindingRecordId(binding.owner, binding.bot),
    },
    assertCurrent,
  );
}

async function deleteAndVerifyMissing(url: string, operation: string): Promise<void> {
  const fence = HomeserverService.createWriteFence({ guardFirstPass: false });
  return retryHomeserverWriteAfterReread(fence, async () => {
    try {
      await HomeserverService.request({ fence, method: HttpMethod.DELETE, url });
    } catch (error) {
      if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) throw error;
    }
    try {
      await HomeserverService.request({ method: HttpMethod.GET, url });
    } catch (error) {
      if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return;
      throw error;
    }
    throw pubchiValidationError('SCHEMA_INVALID', operation);
  });
}

function sameOwnerBinding(left: OwnerBindingV1, right: OwnerBindingV1): boolean {
  return (
    left.schema === right.schema &&
    left.version === right.version &&
    left.owner === right.owner &&
    left.bot === right.bot &&
    left.status === right.status &&
    left.key_generation === right.key_generation &&
    left.created_at === right.created_at &&
    left.updated_at === right.updated_at
  );
}

function sameBot(left: PubchiBotV1, right: PubchiBotV1): boolean {
  return (
    left.schema === right.schema &&
    left.version === right.version &&
    left.owner === right.owner &&
    left.bot === right.bot &&
    left.display_name === right.display_name &&
    left.created_at === right.created_at &&
    left.backup_confirmed_at === right.backup_confirmed_at &&
    left.homeserver_account === right.homeserver_account &&
    left.key_generation === right.key_generation
  );
}

function sameDelegation(left: DeviceDelegationV1, right: DeviceDelegationV1): boolean {
  return (
    left.owner === right.owner &&
    left.signer === right.signer &&
    left.bot === right.bot &&
    left.created_at === right.created_at &&
    left.expires_at === right.expires_at &&
    left.signature === right.signature &&
    left.purposes.length === right.purposes.length &&
    left.purposes.every((purpose, index) => purpose === right.purposes[index])
  );
}

async function rollbackBindingWrite(
  params: PubchiBindingWriteParams,
  previous: Awaited<ReturnType<typeof LocalPubchiBindingService.read>>,
): Promise<void> {
  if (previous) {
    await LocalPubchiBindingService.upsert(previous);
    return;
  }
  await LocalPubchiBindingService.delete(params.owner, params.bot);
}

async function markBindingRevoked(
  local: NonNullable<Awaited<ReturnType<typeof LocalPubchiBindingService.readActive>>>,
) {
  const now = Math.floor(Date.now() / 1000);
  const revoked = {
    schema: 'pubchi-owner-binding' as const,
    version: 1 as const,
    owner: local.owner,
    bot: local.bot,
    status: 'revoked' as const,
    created_at: local.created_at,
    updated_at: now,
  };
  const parsed = parseOwnerBindingV1(revoked);
  if (!parsed.ok) throw pubchiValidationError(parsed.code, 'reconcileActiveBinding');
  await LocalPubchiBindingService.upsert({ ...parsed.value, id: bindingRecordId(local.owner, local.bot) });
}

function interpretQueryResponse(response: unknown): PubchiQuerySuccess {
  const schema = responseSchema(response);
  if (schema === 'pubchi-answer') {
    const answer = parsePubchiAnswerV1(response);
    if (answer.ok) return { kind: 'answer', result: answer.value };
    throw pubchiValidationError(answer.code, 'query');
  }
  if (schema === 'pubchi-query-result') {
    const query = parseQueryResultV1(response);
    if (query.ok) return { kind: 'query', result: query.value };
    throw pubchiValidationError(query.code, 'query');
  }
  if (schema === 'pubchi-feed-proposal') {
    const feed = parseFeedProposal(response);
    if (!feed.ok) {
      if (
        feed.code === 'FEED_UNSUPPORTED_LIKES' ||
        feed.code === 'FEED_UNSUPPORTED_REACH' ||
        feed.code === 'FEED_SPECS_INVALID'
      ) {
        return { kind: 'feed-unsupported', code: feed.code };
      }
      throw pubchiValidationError(feed.code, 'query');
    }
    if (feed.value.version === 2) return { kind: 'feed-v2', result: feed.value, applyAllowed: false };
    return { kind: 'feed', result: feed.value, applyAllowed: true };
  }

  const code = extractPubchiErrorCode(response) ?? 'SCHEMA_INVALID';
  throw pubchiValidationError(code, 'query');
}

function responseSchema(response: unknown): string | undefined {
  if (response === null || typeof response !== 'object' || Array.isArray(response)) return undefined;
  const schema = (response as { schema?: unknown }).schema;
  return typeof schema === 'string' ? schema : undefined;
}

export function assertRequestSignerIsStoredDevice(signer: string | undefined, storedSigner: string): void {
  if (signer !== storedSigner) throw pubchiValidationError('DELEGATION_INVALID', 'query');
}

export function assertDeviceSignerIsPubkyId(signer: string, operation: string): void {
  if (!isPubkyId(signer)) throw pubchiValidationError('DELEGATION_INVALID', operation);
}

async function loadTrustedDeviceKey(owner: string, now: number) {
  const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
  assertPubchiCapability(owner);
  const device = await loadOrGenerateDeviceKey(owner, now, fence.assertCurrent);
  fence.assertCurrent();
  try {
    assertDeviceSignerIsPubkyId(device.signer, 'commitCreateBinding');
    return device;
  } catch {
    fence.assertCurrent();
    await deleteDeviceKey(owner, device.signer);
    const minted = await loadOrGenerateDeviceKey(owner, now, fence.assertCurrent);
    fence.assertCurrent();
    assertDeviceSignerIsPubkyId(minted.signer, 'commitCreateBinding');
    return minted;
  }
}

function assertPubchiCapability(owner: string): void {
  if (!sessionCanWritePubchi(owner)) throw pubchiValidationError('PATH_FORBIDDEN', 'pubchi');
}

async function listPublicPubchiDocuments(
  owner: string,
  includeHistory: boolean,
): Promise<Array<{ path: string; body: string }>> {
  const urls = new Set<string>();
  for (const directory of publicListDirectories(includeHistory)) {
    const files = await HomeserverService.listAll({ baseDirectory: `pubky://${owner}${directory}` });
    for (const file of files) urls.add(file);
  }
  const documents: Array<{ path: string; body: string }> = [];
  for (const url of [...urls].sort()) {
    const path = pathFromOwnedUrl(url, owner);
    if (!path || !isAllowlistedPath(path)) continue;
    if (!includeHistory && isHistoryPath(path)) continue;
    documents.push({ path, body: await HomeserverService.requestRawText(url) });
  }
  return documents;
}

function pubchiConfigUri(owner: string): string {
  return `pubky://${owner}/pub/app.pubchi/v1/config.json`;
}

function pubchiSuggestionsDirectory(owner: string): string {
  return `pubky://${owner}/pub/app.pubchi/v1/suggestions/`;
}

function pubchiSuggestionUri(owner: string, suggestionId: string): string {
  return `pubky://${owner}${suggestionPath(suggestionId)}`;
}

function pubchiContextUri(owner: string): string {
  return `pubky://${owner}/priv/app.pubchi/v1/context.json`;
}

function pubchiCursorUri(owner: string): string {
  return `pubky://${owner}/priv/app.pubchi/v1/cursor.json`;
}

function devicesUri(owner: string): string {
  return `pubky://${owner}/pub/app.pubchi/v1/devices/`;
}

function defaultPubchiConfig(owner: string, bot: string, now: number): PubchiConfigV1 {
  return {
    schema: 'pubchi-config',
    version: 1,
    bot,
    owner,
    updated_at: now,
    display_name: 'Pubchi',
    tier: 'read-only',
    language: 'en',
    summary: { length: 'short', include_sources: true, include_disagreement: true },
    interests: { topics: [], excluded_topics: [] },
    proactive: { enabled: false, max_suggestions_per_day: 1, quiet_hours_utc: { start: 22, end: 7 } },
    follower_history_opt_in: false,
    brain: {
      adapter: 'vercel-ai',
      execution: 'synonym-hosted',
      provider_id: 'moonshot',
      model_id: 'kimi-k3',
      endpoint: null,
      send_public_graph_context: true,
      send_public_web_context: DEFAULT_SEND_PUBLIC_WEB_CONTEXT,
    },
  };
}

const SERVED_DELEGATION_PURPOSES = ['ask', 'who-tagged-me', 'build-feed'] as const;

export async function refreshPublishedDelegation(owner: string): Promise<void> {
  if (!sessionCanWritePubchi(owner)) return;
  const binding = await LocalPubchiBindingService.readActive(owner);
  if (!binding) return;
  const now = Math.floor(Date.now() / 1000);
  const device = await getCurrentDeviceKey(owner, now);
  if (!device) return;
  try {
    await publishDeviceDelegation(owner, binding.bot, device, now);
  } catch {
    return;
  }
}

async function publishDeviceDelegation(
  owner: string,
  bot: string,
  device: Awaited<ReturnType<typeof loadOrGenerateDeviceKey>>,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
  return retryHomeserverWriteAfterReread(fence, async () => {
    const url = delegationUri(owner, device.signer);
    let current: ReturnType<typeof parseDeviceDelegationV1>;
    try {
      const raw = await HomeserverService.request<unknown>({ method: HttpMethod.GET, url });
      current = parseDeviceDelegationV1(raw);
      if (!current.ok) current = { ok: false, code: 'SCHEMA_INVALID' };
    } catch (error) {
      if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) throw error;
      current = { ok: false, code: 'SCHEMA_INVALID' };
    }
    if (
      current.ok &&
      current.value.owner === owner &&
      current.value.signer === device.signer &&
      current.value.bot === bot &&
      SERVED_DELEGATION_PURPOSES.every((purpose) => current.value.purposes.includes(purpose)) &&
      current.value.expires_at - now > DEVICE_DELEGATION_REFRESH_SECONDS
    ) {
      return true;
    }
    const unsigned: UnsignedDeviceDelegationV1 = {
      schema: 'pubchi-device-delegation',
      version: 1,
      owner,
      signer: device.signer,
      bot,
      purposes: current.ok ? [...current.value.purposes] : [...SERVED_DELEGATION_PURPOSES],
      created_at: Math.max(device.created_at, now),
      expires_at: now + DEVICE_DELEGATION_MAX_SECONDS,
    };
    const signed = await signDeviceDelegationV1(unsigned, device.key);
    const root = validatePublicRootReferences(signed);
    if (!root.ok) throw pubchiValidationError(root.code, 'refreshPublishedDelegation');
    const size = validatePubchiDocumentSize(signed);
    if (!size.ok) throw pubchiValidationError(size.code, 'refreshPublishedDelegation');
    await HomeserverService.request({ fence, method: HttpMethod.PUT, url, bodyJson: signed });
    const readBack = parseDeviceDelegationV1(await HomeserverService.request<unknown>({ method: HttpMethod.GET, url }));
    if (!readBack.ok || JSON.stringify(readBack.value) !== JSON.stringify(signed)) {
      throw pubchiValidationError('SCHEMA_INVALID', 'refreshPublishedDelegation');
    }
    await updateDeviceKeyExpiry(owner, device.signer, signed.expires_at);
    return true;
  });
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return (
    keys.length === Object.keys(rightRecord).length &&
    keys.every((key) => key in rightRecord && deepEqual(leftRecord[key], rightRecord[key]))
  );
}

function sessionCanWritePubchi(owner: string): boolean {
  const session = HomeserverService.getCurrentSessionInfo();
  if (!session) return false;
  const sessionPubky = session.publicKey?.z32?.();
  if (!sessionPubky || sessionPubky !== owner) return false;
  return capabilitiesCoverPubchiWrite(session.capabilities);
}

function ownerPending(owner: string): PendingDelegationDelete[] {
  return readPendingDelegationDeletes(owner);
}

function dedupePending(items: PendingDelegationDelete[]): PendingDelegationDelete[] {
  return [...new Map(items.map((item) => [`${item.owner}:${item.signer}`, item])).values()];
}

export function isDrainTimeout(error: unknown): boolean {
  return error instanceof AppError && error.category === ErrorCategory.Timeout;
}

function isAuthDenied(error: unknown): boolean {
  return (
    hasHttpStatus(error, HttpStatusCode.UNAUTHORIZED) ||
    hasHttpStatus(error, HttpStatusCode.FORBIDDEN) ||
    (error instanceof AppError && error.category === ErrorCategory.Auth)
  );
}

export async function deleteDelegationRecord(item: PendingDelegationDelete): Promise<void> {
  if (!isPubkyId(item.owner) || !isPubkyId(item.signer)) {
    throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
      service: ErrorService.Pubchi,
      operation: 'unpublishKnownDelegations',
    });
  }
  try {
    const fence = HomeserverService.createWriteFence();
    await retryHomeserverWriteAfterReread(fence, () =>
      HomeserverService.request({ method: HttpMethod.DELETE, url: delegationUri(item.owner, item.signer), fence }),
    );
  } catch (error) {
    if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return;
    throw error;
  }
}

async function getDeviceKeysBounded(owner: string) {
  return withTimeout(
    isPubchiEnabled() ? getDeviceKeys(owner) : LocalPubchiRecordService.getDeviceSignersForCleanup(owner),
    PUBCHI_DELEGATION_DELETE_TIMEOUT_MS,
    'Pubchi device-key read timed out',
  );
}

async function liveDeviceSigners(
  owner: string,
): Promise<{ ok: true; signers: Set<string> } | { ok: false; defer: boolean }> {
  try {
    return { ok: true, signers: new Set((await getDeviceKeysBounded(owner)).map((key) => key.signer)) };
  } catch (error) {
    return { ok: false, defer: isDrainTimeout(error) };
  }
}

export async function listKnownDelegations(
  owner: string,
): Promise<{ kind: 'ok'; items: PendingDelegationDelete[] } | { kind: 'defer' }> {
  try {
    const keys = await getDeviceKeysBounded(owner);
    return {
      kind: 'ok',
      items: keys.flatMap((key) => {
        const entry = parsePendingEntry({ owner, signer: key.signer });
        return entry ? [entry] : [];
      }),
    };
  } catch (error) {
    if (isDrainTimeout(error)) return { kind: 'defer' };
    return { kind: 'ok', items: ownerPending(owner) };
  }
}

/**
 * Same-pubky restore keeps this owner's key. A missing key is left missing so
 * enroll can mint a fresh signer. Foreign local rows are wiped. Remote
 * delegations for a previous identity stay published until that identity signs
 * in again — we have no write capability on their `/pub/app.pubchi/v1/` path.
 */
async function wipeLocalStateFromOtherIdentities(owner: string): Promise<void> {
  const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
  const isCurrent = () => {
    try {
      fence.assertCurrent();
      return true;
    } catch {
      return false;
    }
  };
  try {
    const foreign = await listDeviceKeysNotOwnedBy(owner);
    if (!isCurrent()) return;
    rememberPendingDelegationDeletesPreservingOwner(
      owner,
      foreign.flatMap((row) => {
        const entry = parsePendingEntry({ owner: row.owner, signer: row.signer });
        return entry ? [entry] : [];
      }),
    );
    for (const foreignOwner of new Set(foreign.map((row) => row.owner))) {
      await LocalPubchiRecordService.clearOwnerData(foreignOwner, isCurrent);
    }
  } catch (error) {
    Logger.warn('Pubchi foreign-identity wipe failed', { error });
  }
}
