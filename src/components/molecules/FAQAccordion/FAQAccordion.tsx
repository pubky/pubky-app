'use client';

import { Accordion as AccordionPrimitive } from 'radix-ui';
import Markdown from 'react-markdown';
import * as Libs from '@/libs';
import type { FAQAccordionProps } from './FAQAccordion.types';
import { ChevronRight } from 'lucide-react';
export function FAQAccordion({ items, className }: FAQAccordionProps) {
  return (
    <AccordionPrimitive.Root type="single" collapsible className={Libs.cn('flex w-full flex-col gap-3', className)}>
      {items.map((item) => (
        <AccordionPrimitive.Item
          key={item.id}
          value={item.id}
          className="w-full overflow-hidden rounded-md border border-border"
        >
          <AccordionPrimitive.Header>
            <AccordionPrimitive.Trigger className="group flex w-full cursor-pointer items-center justify-between px-6 py-4 transition-colors hover:bg-white/5">
              <span className="text-left text-sm leading-5 font-medium text-popover-foreground">{item.question}</span>
              <ChevronRight
                size={16}
                className="ml-4 shrink-0 transition-transform group-data-[state=open]:rotate-90"
              />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="px-6 pt-2 pb-4 text-base leading-6 font-medium text-muted-foreground">
              <Markdown
                components={{
                  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="mt-2 mb-3 ml-6 list-disc last:mb-0">{children}</ul>,
                  ol: ({ children }) => <ol className="mt-2 mb-3 ml-6 list-decimal last:mb-0">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                }}
              >
                {item.answer}
              </Markdown>
            </div>
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
