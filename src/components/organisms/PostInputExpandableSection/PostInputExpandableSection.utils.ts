import { POST_INPUT_BUTTON_LABEL, POST_INPUT_VARIANT } from '../PostInput/PostInput.constants';
import type { PostInputVariant } from '../PostInput/PostInput.types';

/**
 * Returns the appropriate button label based on the variant.
 * Articles always submit as "Publish", in create and in edit: the edit variant
 * of an article is still a publish action, and "Edit" reads as if the button
 * does nothing.
 * @param variant - The current variant (post, reply, repost, or edit)
 * @param isArticle - Optional flag indicating the article sub-mode of a variant
 * @returns The capitalized label for the submit button
 */
export function getButtonLabel(variant?: PostInputVariant, isArticle?: boolean): string {
  if (isArticle) {
    return 'Publish';
  }

  if (!variant || !(variant in POST_INPUT_BUTTON_LABEL)) {
    return POST_INPUT_BUTTON_LABEL[POST_INPUT_VARIANT.POST];
  }

  return POST_INPUT_BUTTON_LABEL[variant];
}
