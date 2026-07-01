'use client';

import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import type { Ancestor } from '@/hooks/usePostAncestors/usePostAncestors.types';
import { Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbSeparator } from '@/molecules/Breadcrumb/Breadcrumb';
import type { PostPageBreadcrumbProps } from './PostPageBreadcrumb.types';

/**
 * PostPageBreadcrumb Organism
 *
 * Renders breadcrumb navigation for post reply chains.
 * When there are more than 3 ancestors, it truncates the middle items
 * into a dropdown menu showing: first > ... > second-to-last > last
 *
 * @example
 * ```tsx
 * <PostPageBreadcrumb
 *   ancestors={[...]}
 *   userDetailsMap={new Map([['user1', 'John']])}
 *   onNavigate={(postId) => router.push(`/post/${postId}`)}
 * />
 * ```
 */
export function PostPageBreadcrumb({ ancestors, userDetailsMap, onNavigate }: PostPageBreadcrumbProps) {
  const ITEMS_TO_DISPLAY = 3;
  const shouldTruncate = ancestors.length > ITEMS_TO_DISPLAY;

  // Render a single breadcrumb item
  const renderItem = (ancestor: Ancestor, index: number, arrayLength: number) => {
    const isLast = index === arrayLength - 1;
    const userName = userDetailsMap.get(ancestor.userId) || 'Unknown';

    return (
      <React.Fragment key={ancestor.postId}>
        <BreadcrumbItem
          variant={isLast ? 'current' : 'link'}
          className={isLast ? 'max-w-[50%] min-w-0 shrink-0 overflow-hidden' : 'min-w-0 shrink overflow-hidden'}
          onClick={isLast ? undefined : () => onNavigate(ancestor.postId)}
          data-testid={`breadcrumb-item-${index}`}
        >
          {userName}
        </BreadcrumbItem>
        {!isLast && <BreadcrumbSeparator size="sm" />}
      </React.Fragment>
    );
  };

  return (
    <Breadcrumb size="md" className="w-full min-w-0" data-testid="post-breadcrumb">
      {/* Case 1: No Truncation needed */}
      {!shouldTruncate && ancestors.map((ancestor, index) => renderItem(ancestor, index, ancestors.length))}

      {/* Case 2: Truncation Active */}
      {shouldTruncate && (
        <>
          {/* 1. First Item */}
          {renderItem(ancestors[0], 0, ancestors.length)}

          {/* 2. Dropdown for Middle Items - using raw li to avoid nested button */}
          <li className="flex shrink-0 items-center justify-center gap-2.5 text-muted-foreground">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-1 outline-none"
                data-testid="breadcrumb-ellipsis-trigger"
              >
                <BreadcrumbEllipsis className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" data-testid="breadcrumb-dropdown-content">
                {ancestors.slice(1, -2).map((ancestor) => (
                  <DropdownMenuItem
                    key={ancestor.postId}
                    onClick={() => onNavigate(ancestor.postId)}
                    data-testid={`breadcrumb-dropdown-item-${ancestor.postId}`}
                  >
                    {userDetailsMap.get(ancestor.userId) || 'Unknown'}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
          <BreadcrumbSeparator size="sm" />

          {/* 3. Last Two Items */}
          {ancestors.slice(-2).map((ancestor, i) => {
            // Calculate the actual index in the original array for correct "isLast" logic
            const actualIndex = ancestors.length - 2 + i;
            return renderItem(ancestor, actualIndex, ancestors.length);
          })}
        </>
      )}
    </Breadcrumb>
  );
}
