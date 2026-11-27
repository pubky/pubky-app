import { ShopEmbed } from '@/organisms/ShopEmbed/ShopEmbed';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-slot="shop-route">
      <ShopEmbed />
      {children}
    </div>
  );
}
