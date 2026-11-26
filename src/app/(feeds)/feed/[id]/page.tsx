import { placeholderParams } from '@/libs/static-export/placeholderParams';

export { Custom as default } from '@/templates/Feed/Custom/Custom';

export function generateStaticParams() {
  return placeholderParams('id');
}
