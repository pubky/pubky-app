import type { Session } from '@synonymdev/pubky';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import type {
  CreatedPubchi,
  DiscoveredTagSuggestion,
  LoadedPubchi,
  PubchiBindingRecordResult,
  PubchiImportPreview,
  PubchiImportResult,
  PubchiQuerySuccess,
} from '@/application/pubchi/pubchi.types';
import { TagKind } from '@/application/tag/tag.types';
import { AuthController } from '@/controllers/auth/auth';
import { PostController } from '@/controllers/post/post';
import { TagController } from '@/controllers/tag/tag';
import { isAppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, NetworkErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Identity } from '@/libs/identity/identity';
import { APP_SIGNIN_CAPABILITIES } from '@/libs/pubchi/capabilities';
import { commitContentForDraftPost } from '@/libs/pubchi/draft-post';
import { isPubchiEnabled, isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { persistDismissedId } from '@/libs/pubchi/proactive';
import { type PubchiConfigV1 } from '@/libs/pubchi/schemas/config';
import { type PubchiOwnerContextV1 } from '@/libs/pubchi/schemas/context';
import { type FeedProposalV2 } from '@/libs/pubchi/schemas/feed';
import { isPubkyId } from '@/libs/pubchi/schemas/pubky';
import { type PubchiSuggestionV1 } from '@/libs/pubchi/schemas/suggestion';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import type { TGenerateAuthUrlResult } from '@/services/homeserver/homeserver.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { type PubchiFlyoutPrefill, usePubchiStore } from '@/stores/pubchi/pubchi.store';
import type {
  TConfirmPubchiBackupParams,
  TCreatePubchiParams,
  TExportPubchiParams,
  TPubchiQueryParams,
} from './pubchi.types';
import { publishPubchiSync } from './pubchi-sync';

export class PubchiController {
  private constructor() {}

  static openFlyout(prefill?: Omit<PubchiFlyoutPrefill, 'ownerPubky'>): void {
    usePubchiStore.getState().openFlyout(prefill, useAuthStore.getState().currentUserPubky);
  }

  static closeFlyout(): void {
    usePubchiStore.getState().closeFlyout();
  }

  static openFeedBuilder(proposal?: FeedProposalV2): void {
    usePubchiStore.getState().openFeedBuilder(proposal);
  }

  static closeFeedBuilder(): void {
    usePubchiStore.getState().closeFeedBuilder();
  }

  static consumePrefill(ownerPubky = useAuthStore.getState().currentUserPubky): PubchiFlyoutPrefill | undefined {
    return usePubchiStore.getState().consumePrefill(ownerPubky);
  }

  static async getActiveBinding(): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) return undefined;
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    return PubchiApplication.getActiveBinding(owner);
  }

  static async createPubchi(params: TCreatePubchiParams): Promise<CreatedPubchi> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'createPubchi',
      });
    }
    const auth = useAuthStore.getState();
    const owner = auth.selectCurrentUserPubky();
    const capabilities = auth.selectSession()?.info.capabilities ?? [];
    const created = await PubchiApplication.createPubchi({ owner, displayName: params.displayName, capabilities });
    const { phrase: _omit, ...loaded } = created;
    if (useAuthStore.getState().currentUserPubky === owner) {
      usePubchiStore.getState().setPubchi(loaded, owner);
    }
    publishPubchiSync(owner, 'created');
    return created;
  }

  static async commitCreateBinding(params: { bot: string }): Promise<PubchiBindingRecordResult> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitCreateBinding',
      });
    }
    const bot = params.bot.trim();
    if (!isPubkyId(bot)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'commitCreateBinding',
      });
    }
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const result = await PubchiApplication.commitCreateBinding({
      owner,
      bot,
    });
    publishPubchiSync(owner, 'created');
    return result;
  }

  static async loadPubchi(): Promise<LoadedPubchi | undefined> {
    if (!isPubchiEnabled()) return undefined;
    const ownerAtStart = useAuthStore.getState().currentUserPubky;
    if (!ownerAtStart) return undefined;
    const pubchi = await PubchiApplication.loadPubchi(ownerAtStart);
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      usePubchiStore.getState().setPubchi(pubchi, ownerAtStart);
    }
    return pubchi;
  }

  static async runAppOpenProactive(): Promise<PubchiSuggestionV1[]> {
    if (!isPubchiEnabled() || !isPubchiPanelEnabled()) return [];
    const ownerAtStart = useAuthStore.getState().currentUserPubky;
    if (!ownerAtStart) return [];
    const suggestions = await PubchiApplication.runAppOpenProactive(ownerAtStart);
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      usePubchiStore.getState().setProactiveSuggestions(suggestions, ownerAtStart);
    }
    return suggestions;
  }

  static dismissProactiveSuggestion(suggestionId: string): void {
    const owner = useAuthStore.getState().currentUserPubky;
    if (!owner) return;
    persistDismissedId(owner, suggestionId);
    const store = usePubchiStore.getState();
    if (store.ownerPubky !== owner) return;
    store.setProactiveSuggestions(
      store.proactiveSuggestions.filter((item) => item.suggestion_id !== suggestionId),
      owner,
    );
  }

  static async confirmBackup(params: TConfirmPubchiBackupParams): Promise<LoadedPubchi> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const pubchi = await PubchiApplication.confirmBackup({ owner, ...params });
    if (useAuthStore.getState().currentUserPubky === owner) {
      usePubchiStore.getState().setPubchi(pubchi, owner);
    }
    publishPubchiSync(owner, 'config-saved');
    return pubchi;
  }

  static async commitDeleteBinding(params: { bot?: string } = {}): Promise<void> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      });
    }
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    if (params.bot !== undefined && !isPubkyId(params.bot.trim())) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      });
    }
    const requestedBot = params.bot?.trim();
    if (requestedBot) {
      await PubchiApplication.commitDeleteBinding({ owner: ownerAtStart, bot: requestedBot });
      if (useAuthStore.getState().currentUserPubky === ownerAtStart) usePubchiStore.getState().clear();
      publishPubchiSync(ownerAtStart, 'removed');
      return;
    }
    const binding = await PubchiApplication.getActiveBinding(ownerAtStart);
    const remote = await PubchiApplication.loadPubchi(ownerAtStart);
    const bot = remote?.bot ?? binding?.bot;
    if (!bot) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_NOT_FOUND', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      });
    }
    await PubchiApplication.commitDeleteBinding({ owner: ownerAtStart, bot });
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) usePubchiStore.getState().clear();
    publishPubchiSync(ownerAtStart, 'removed');
  }

  /**
   * Network-only query. Signs `RequestObjectV1` with the non-extractable
   * device CryptoKey and POSTs to the Pubchi API. The service never receives
   * a session or the account key.
   */
  static async fetchPubchiQuery(params: TPubchiQueryParams): Promise<PubchiQuerySuccess> {
    if (!isPubchiPanelEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'fetchPubchiQuery',
      });
    }
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const context = usePubchiStore.getState().ownerPubky === owner ? usePubchiStore.getState().context : null;
    return PubchiApplication.query({
      owner,
      question: params.question,
      purpose: params.purpose,
      ...(params.purpose === 'ask' && params.conversation?.turns.length ? { conversation: params.conversation } : {}),
      ...(params.proposalVersion ? { proposalVersion: params.proposalVersion } : {}),
      ...(params.targetFeedId ? { targetFeedId: params.targetFeedId } : {}),
      ...(params.currentFeed ? { currentFeed: params.currentFeed } : {}),
      ...(params.target ? { target: params.target } : {}),
      ...(context ? { context } : {}),
    });
  }

  static async applyTagSuggestion(
    recordId: string,
    suggestionIndex: number,
  ): Promise<'applied' | 'superseded' | 'reconciliation-pending'> {
    PubchiApplication.beginTagSuggestionOperation(recordId, suggestionIndex);
    try {
      return await this.applyTagSuggestionInternal(recordId, suggestionIndex);
    } finally {
      PubchiApplication.endTagSuggestionOperation(recordId, suggestionIndex);
    }
  }

  private static async applyTagSuggestionInternal(
    recordId: string,
    suggestionIndex: number,
  ): Promise<'applied' | 'superseded' | 'reconciliation-pending'> {
    const auth = useAuthStore.getState();
    const owner = auth.selectCurrentUserPubky();
    const prepared = await PubchiApplication.prepareTagSuggestionApplication(
      recordId,
      suggestionIndex,
      owner,
      auth.selectSession()?.info.capabilities ?? [],
    );
    const taggedKind = prepared.binding.target.kind === 'post' ? TagKind.POST : TagKind.USER;
    const matched = prepared.binding.target.uri.match(
      prepared.binding.target.kind === 'post'
        ? /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/posts\/([^/]+)$/
        : /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/profile\.json$/,
    );
    if (!matched) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Invalid tag suggestion target', {
        service: ErrorService.Pubchi,
        operation: 'applyTagSuggestion',
      });
    }
    let result;
    try {
      result = await TagController.commitCreatePreservingExisting({
        taggedKind,
        taggedId: taggedKind === TagKind.POST ? `${matched[1]}:${matched[2]}` : matched[1],
        label: prepared.suggestion.label,
        taggerId: owner,
      });
    } catch (cause) {
      await PubchiApplication.finalizeTagSuggestionApplication(
        recordId,
        suggestionIndex,
        prepared.applicationId,
        'failed',
      );
      throw cause;
    }
    const tag = Array.isArray(result) ? result[0] : result;
    if (!tag) {
      await PubchiApplication.finalizeTagSuggestionApplication(
        recordId,
        suggestionIndex,
        prepared.applicationId,
        'failed',
      );
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag application did not return a result', {
        service: ErrorService.Pubchi,
        operation: 'applyTagSuggestion',
      });
    }
    const status = tag.alreadyExisted ? 'superseded' : 'applied';
    try {
      await PubchiApplication.recordTagSuggestionApplyOutcome(
        recordId,
        suggestionIndex,
        tag.alreadyExisted,
        tag.tagDocumentSha256,
      );
    } catch {
      await PubchiApplication.markTagSuggestionReconciliationPending(recordId, suggestionIndex);
      return 'reconciliation-pending';
    }
    try {
      await PubchiApplication.finalizeTagSuggestionApplication(
        recordId,
        suggestionIndex,
        prepared.applicationId,
        status,
        tag.tagUrl,
        tag.alreadyExisted,
      );
      return status;
    } catch (cause) {
      await PubchiApplication.markTagSuggestionReconciliationPending(recordId, suggestionIndex);
      throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Tag was written but receipt needs reconciliation', {
        service: ErrorService.Pubchi,
        operation: 'applyTagSuggestion',
        cause,
      });
    }
  }

  static async revertTagSuggestion(recordId: string, suggestionIndex: number): Promise<void> {
    PubchiApplication.beginTagSuggestionOperation(recordId, suggestionIndex);
    try {
      await this.revertTagSuggestionInternal(recordId, suggestionIndex);
    } finally {
      PubchiApplication.endTagSuggestionOperation(recordId, suggestionIndex);
    }
  }

  private static async revertTagSuggestionInternal(recordId: string, suggestionIndex: number): Promise<void> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const prepared = await PubchiApplication.prepareTagSuggestionRevert(recordId, suggestionIndex, owner);
    await PubchiApplication.recordTagSuggestionRevertOperation(recordId, suggestionIndex);
    const matched = prepared.binding.target.uri.match(
      prepared.binding.target.kind === 'post'
        ? /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/posts\/([^/]+)$/
        : /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/profile\.json$/,
    );
    if (!matched) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Invalid tag suggestion target', {
        service: ErrorService.Pubchi,
        operation: 'revertTagSuggestion',
      });
    }
    const taggedKind = prepared.binding.target.kind === 'post' ? TagKind.POST : TagKind.USER;
    const tagParams = {
      taggedKind,
      taggedId: taggedKind === TagKind.POST ? `${matched[1]}:${matched[2]}` : matched[1],
      label: prepared.suggestion.label,
      taggerId: owner,
    };
    await this.deleteTagSuggestion(tagParams, prepared.tagDocumentSha256);
    try {
      await PubchiApplication.finalizeTagSuggestionApplication(
        recordId,
        suggestionIndex,
        prepared.applicationId,
        'reverted',
      );
    } catch (cause) {
      await PubchiApplication.markTagSuggestionReconciliationPending(recordId, suggestionIndex);
      throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Tag was removed but receipt needs reconciliation', {
        service: ErrorService.Pubchi,
        operation: 'revertTagSuggestion',
        cause,
      });
    }
  }

  static async reconcileTagSuggestion(
    recordId: string,
    suggestionIndex: number,
  ): Promise<'proposed' | 'applying' | 'applied' | 'superseded' | 'failed' | 'reverted' | 'reconciliation-pending'> {
    return PubchiApplication.reconcileTagSuggestionApplication(
      recordId,
      suggestionIndex,
      useAuthStore.getState().selectCurrentUserPubky(),
    );
  }

  static async getTagSuggestionStatuses(recordId: string): Promise<Record<number, string>> {
    const record = await PubchiApplication.getTagApplication(recordId);
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    if (!record || record.owner !== owner) return {};
    return PubchiApplication.rehydrateTagSuggestionStatuses(recordId, owner);
  }

  static async applyDraftPost(recordId: string): Promise<'applied' | 'reconciliation-pending'> {
    return PubchiApplication.runDraftPostOperation(recordId, 'applyDraftPost', () =>
      this.applyDraftPostInternal(recordId),
    );
  }

  private static async applyDraftPostInternal(recordId: string): Promise<'applied' | 'reconciliation-pending'> {
    const auth = useAuthStore.getState();
    const owner = auth.selectCurrentUserPubky();
    const prepared = await PubchiApplication.prepareDraftPostApplication(
      recordId,
      owner,
      auth.selectSession()?.info.capabilities ?? [],
    );
    let parentPostId: string | undefined;
    if (prepared.draft.parent_uri) {
      const composite = buildCompositeIdFromPubkyUri({
        uri: prepared.draft.parent_uri,
        domain: CompositeIdDomain.POSTS,
      });
      if (!composite) {
        await PubchiApplication.finalizeDraftPostApplication(recordId, prepared.applicationId, 'failed');
        throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Invalid draft post parent', {
          service: ErrorService.Pubchi,
          operation: 'applyDraftPost',
        });
      }
      parentPostId = composite;
    }
    const published = commitContentForDraftPost(prepared.draft);
    let compositePostId = prepared.existingCompositePostId;
    if (!compositePostId) {
      try {
        compositePostId = await PostController.commitCreate({
          authorId: owner,
          content: published.content,
          isArticle: published.isArticle,
          ...(prepared.draft.tags?.length ? { tags: prepared.draft.tags } : {}),
          ...(parentPostId ? { parentPostId } : {}),
        });
      } catch {
        // The post API did not return an operation-bound ID. A matching body cannot prove authorship.
        await PubchiApplication.markDraftPostReconciliationPending(recordId);
        return 'reconciliation-pending';
      }
    }
    const { pubky, id } = parseCompositeId(compositePostId);
    if (pubky !== owner) {
      await PubchiApplication.finalizeDraftPostApplication(recordId, prepared.applicationId, 'failed');
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft post was not published as you', {
        service: ErrorService.Pubchi,
        operation: 'applyDraftPost',
      });
    }
    const postUri = `pubky://${pubky}/pub/pubky.app/posts/${id}`;
    try {
      await PubchiApplication.recordDraftPostApplyOutcome(recordId, compositePostId, postUri);
    } catch {
      await PubchiApplication.markDraftPostReconciliationPending(recordId);
      return 'reconciliation-pending';
    }
    try {
      await PubchiApplication.finalizeDraftPostApplication(
        recordId,
        prepared.applicationId,
        'applied',
        postUri,
        compositePostId,
      );
      return 'applied';
    } catch (cause) {
      await PubchiApplication.markDraftPostReconciliationPending(recordId);
      throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Post was written but receipt needs reconciliation', {
        service: ErrorService.Pubchi,
        operation: 'applyDraftPost',
        cause,
      });
    }
  }

  static async rejectDraftPost(recordId: string): Promise<void> {
    await PubchiApplication.runDraftPostOperation(recordId, 'rejectDraftPost', async () => {
      const auth = useAuthStore.getState();
      await PubchiApplication.prepareDraftPostReject(
        recordId,
        auth.selectCurrentUserPubky(),
        auth.selectSession()?.info.capabilities ?? [],
      );
    });
  }

  static async revertDraftPost(recordId: string): Promise<void> {
    await PubchiApplication.runDraftPostOperation(recordId, 'revertDraftPost', () =>
      this.revertDraftPostInternal(recordId),
    );
  }

  private static async revertDraftPostInternal(recordId: string): Promise<void> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const prepared = await PubchiApplication.prepareDraftPostRevert(recordId, owner);
    await PubchiApplication.recordDraftPostRevertOperation(recordId);
    try {
      await PostController.commitDelete({ compositePostId: prepared.compositePostId });
    } catch (cause) {
      if (isAppError(cause) && cause.code === ClientErrorCode.NOT_FOUND) {
        await PubchiApplication.finalizeDraftPostApplication(recordId, prepared.applicationId, 'reverted');
        return;
      }
      await PubchiApplication.markDraftPostReconciliationPending(recordId);
      throw cause;
    }
    try {
      await PubchiApplication.finalizeDraftPostApplication(recordId, prepared.applicationId, 'reverted');
    } catch (cause) {
      await PubchiApplication.markDraftPostReconciliationPending(recordId);
      throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Post was removed but receipt needs reconciliation', {
        service: ErrorService.Pubchi,
        operation: 'revertDraftPost',
        cause,
      });
    }
  }

  static async reconcileDraftPost(
    recordId: string,
  ): Promise<'proposed' | 'applying' | 'applied' | 'failed' | 'reverted' | 'rejected' | 'reconciliation-pending'> {
    return PubchiApplication.reconcileDraftPostApplication(recordId, useAuthStore.getState().selectCurrentUserPubky());
  }

  static async getDraftPostStatus(recordId: string): Promise<string | undefined> {
    const record = await PubchiApplication.getDraftPost(recordId);
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    if (!record || record.owner !== owner) return undefined;
    return PubchiApplication.rehydrateDraftPostStatus(recordId, owner);
  }

  static async discoverTagSuggestions(
    targetUri: string,
    isCurrent?: () => boolean,
    liveRecordId?: string,
  ): Promise<DiscoveredTagSuggestion[]> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const tokenIsCurrent = () => useAuthStore.getState().currentUserPubky === owner && (isCurrent?.() ?? true);
    const results = await PubchiApplication.discoverTagSuggestions(owner, targetUri, tokenIsCurrent, liveRecordId);
    return tokenIsCurrent() ? results : [];
  }

  static async reconcileDiscoveredTagSuggestion(
    targetUri: string,
    applicationId: string,
    isCurrent: () => boolean = () => true,
  ): Promise<DiscoveredTagSuggestion | undefined> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const tokenIsCurrent = () => useAuthStore.getState().currentUserPubky === owner && isCurrent();
    return PubchiApplication.reconcileDiscoveredTagSuggestion(owner, targetUri, applicationId, tokenIsCurrent);
  }

  static async revertDiscoveredTagSuggestion(
    targetUri: string,
    applicationId: string,
    isCurrent: () => boolean = () => true,
  ): Promise<DiscoveredTagSuggestion | undefined> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const tokenIsCurrent = () => useAuthStore.getState().currentUserPubky === owner && isCurrent();
    if (!tokenIsCurrent()) return undefined;
    const prepared = await PubchiApplication.prepareDiscoveredTagSuggestionRevert(owner, targetUri, applicationId);
    if (!tokenIsCurrent()) return undefined;
    await this.deleteTagSuggestion(prepared.tagParams, prepared.tagDocumentSha256, tokenIsCurrent);
    if (!tokenIsCurrent()) return undefined;
    return PubchiApplication.finalizeDiscoveredTagSuggestionRevert(
      owner,
      targetUri,
      applicationId,
      prepared.receipt,
      tokenIsCurrent,
    );
  }

  private static async deleteTagSuggestion(
    tagParams: Parameters<typeof TagController.commitDelete>[0],
    tagDocumentSha256: string,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    if (!isCurrent()) return;
    await TagController.materializeForDelete(tagParams);
    if (!isCurrent()) return;
    await TagController.commitDeleteIfUnchanged(tagParams, tagDocumentSha256);
  }

  static async loadPubchiCursor(): Promise<string | null> {
    return PubchiApplication.loadPubchiCursor(useAuthStore.getState().selectCurrentUserPubky());
  }

  static async savePubchiCursor(owner: string, cursor: string): Promise<void> {
    return PubchiApplication.savePubchiCursor(owner, cursor);
  }

  static async reconcileActiveBinding(): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) return undefined;
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    return PubchiApplication.reconcileActiveBinding(owner);
  }

  static async ensureDeviceReady(): Promise<boolean> {
    if (!isPubchiEnabled()) return false;
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    const ready = await PubchiApplication.ensureDeviceReady(ownerAtStart);
    if (ready) publishPubchiSync(ownerAtStart, 'devices-changed');
    return ready;
  }

  static async listDeviceKeys() {
    if (!isPubchiEnabled()) return [];
    return PubchiApplication.listDeviceDelegations(useAuthStore.getState().selectCurrentUserPubky());
  }

  static hadDeviceListingFailures(): boolean {
    return PubchiApplication.hadDeviceListingFailures();
  }

  static async loadPubchiConfig(): Promise<PubchiConfigV1 | null> {
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    const config = await PubchiApplication.loadPubchiConfig(ownerAtStart);
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      usePubchiStore.getState().setConfig(config, ownerAtStart);
    }
    return config;
  }

  static async loadPubchiContext(): Promise<PubchiOwnerContextV1 | null> {
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    const context = await PubchiApplication.loadPubchiContext(ownerAtStart);
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      usePubchiStore.getState().setContext(context, ownerAtStart);
    }
    return context;
  }

  static async savePubchiContext(
    partial: Pick<PubchiOwnerContextV1, 'about' | 'instructions'>,
  ): Promise<PubchiOwnerContextV1> {
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    const context = await PubchiApplication.savePubchiContext(ownerAtStart, partial);
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      usePubchiStore.getState().setContext(context, ownerAtStart);
    }
    return context;
  }

  static async savePubchiConfig(partial: Partial<PubchiConfigV1>): Promise<PubchiConfigV1> {
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    const config = await PubchiApplication.savePubchiConfig(ownerAtStart, partial);
    const store = usePubchiStore.getState();
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      store.setConfig(config, ownerAtStart);
      if (store.pubchi) store.setPubchi({ ...store.pubchi, displayName: config.display_name }, ownerAtStart);
    }
    publishPubchiSync(ownerAtStart, 'config-saved');
    return config;
  }

  static async fetchExportPubchi(params: TExportPubchiParams = {}): Promise<PubchiImportPreview['bundle']> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'fetchExportPubchi',
      });
    }
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    return PubchiApplication.exportPubchiState(owner, params);
  }

  static async fetchImportPlan(input: unknown): Promise<PubchiImportPreview> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'fetchImportPlan',
      });
    }
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    return PubchiApplication.planImportPubchiState(owner, input);
  }

  static async commitImportPubchi(input: unknown): Promise<PubchiImportResult> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitImportPubchi',
      });
    }
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const result = await PubchiApplication.importPubchiState(owner, input);
    publishPubchiSync(owner, 'config-saved');
    return result;
  }

  static getCapabilityApprovalUrl(capabilities = APP_SIGNIN_CAPABILITIES): Promise<TGenerateAuthUrlResult | null> {
    return AuthController.requestCapabilities(capabilities.split(','));
  }

  /** The official capability flow already adopted its same-account, generation-fenced approval. */
  static async adoptCapabilityApproval(session: Session): Promise<void> {
    const auth = useAuthStore.getState();
    if (
      auth.isLoggingOut ||
      auth.session !== session ||
      Identity.z32FromSession({ session }) !== auth.currentUserPubky
    ) {
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'PUBCHI_SESSION_IDENTITY_MISMATCH', {
        service: ErrorService.Pubchi,
        operation: 'adoptCapabilityApproval',
      });
    }
  }

  static subscribeDatabaseBlocked(): () => void {
    return PubchiApplication.subscribeDatabaseBlocked((blocked) =>
      usePubchiStore.getState().setDatabaseBlocked(blocked),
    );
  }

  static fetchBuiltFeedProvenance() {
    return PubchiApplication.fetchBuiltFeedProvenance(useAuthStore.getState().selectCurrentUserPubky());
  }

  static commitRecordBuiltFeed({
    proposal,
    feed,
    provenanceFeedId,
  }: {
    proposal: Parameters<typeof PubchiApplication.recordBuiltFeed>[1];
    feed: Parameters<typeof PubchiApplication.recordBuiltFeed>[2];
    provenanceFeedId?: string;
  }): Promise<boolean> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    if (proposal.owner !== owner)
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'PUBCHI_SESSION_IDENTITY_MISMATCH', {
        service: ErrorService.Pubchi,
        operation: 'commitRecordBuiltFeed',
      });
    return PubchiApplication.recordBuiltFeed(owner, proposal, feed, provenanceFeedId);
  }

  static async revokeDevice(signer: string): Promise<void> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    if (!isPubkyId(owner) || !isPubkyId(signer)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'revokeDevice',
      });
    }
    await PubchiApplication.revokeDevice(owner, signer);
    publishPubchiSync(owner, 'devices-changed');
  }

  static async revokeAllDevices(): ReturnType<typeof PubchiApplication.revokeAllDevices> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    if (!isPubkyId(owner)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'revokeAllDevices',
      });
    }
    const result = await PubchiApplication.revokeAllDevices(owner);
    publishPubchiSync(owner, 'devices-changed');
    return result;
  }
}
