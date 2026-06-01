//-- copyright
// OpenProject is an open source project management software.
// Copyright (C) the OpenProject GmbH
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//
// See COPYRIGHT and LICENSE files for more details.
//++

import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { preventUnhandled } from '@atlaskit/pragmatic-drag-and-drop/prevent-unhandled';
import { Controller } from '@hotwired/stimulus';
import { attributeTokenList } from 'core-app/shared/helpers/dom-helpers';
import { closestInteractiveElement } from 'core-stimulus/helpers/interactive-element-helper';
import {
  isSortableItemData,
  sortableItemSelector,
  sortableItemData,
  sortableItemKeyboardDropEvent,
  sortableListSelector,
  sortableListsMovingAttribute,
  sortableListsRootSelector,
  type SortableItemKeyboardDropDetail,
  type SortableItemData,
} from './drag-and-drop';

type CleanupFn = () => void;

export default class ItemController extends Controller<HTMLElement> {
  static targets = ['handle', 'preview'];

  static values = {
    id: String,
    moveUrl: String,
    type: { type: String, default: 'item' },
  };

  declare idValue:string;
  declare moveUrlValue:string;
  declare typeValue:string;

  declare readonly handleTarget:HTMLElement;
  declare readonly hasHandleTarget:boolean;
  declare readonly previewTarget:HTMLElement;

  private cleanupFn?:CleanupFn;
  private dropIndicatorElement?:HTMLElement;
  private keyboardDropIndex?:number;
  private keyboardSorting = false;
  private readonly refreshAfterMorphBound = this.refreshAfterMorph.bind(this);
  private static nextDescriptionId = 0;

  connect() {
    this.cleanupFn = combine(
      this.registerHandleAccessibility(),
      this.registerHandleKeyboardSorting(),
      this.registerDraggable(),
      this.registerDropTarget(),
      this.registerTurboMorphRefresh(),
    );
  }

  disconnect() {
    this.cleanupFn?.();
    this.cleanupFn = undefined;
  }

  private renderDropIndicator(edge:Edge|null) {
    const currentEdge = this.dropIndicatorElement?.dataset.dropPosition;
    const currentOwner = this.dropIndicatorElement?.dataset.dropPositionOwner;
    const nextIndicator = edge ? this.resolveDropIndicator(edge) : null;

    if (
      currentOwner === this.idValue &&
      nextIndicator &&
      this.dropIndicatorElement === nextIndicator.element &&
      currentEdge === nextIndicator.edge
    ) {
      return;
    }

    this.clearDropIndicator();

    if (nextIndicator) {
      this.renderDropIndicatorOn(nextIndicator.element, nextIndicator.edge);
    }
  }

  private renderDropIndicatorOn(element:HTMLElement, edge:Edge):void {
    this.dropIndicatorElement = element;
    element.dataset.dropPosition = edge;
    element.dataset.dropPositionOwner = this.idValue;
  }

  private clearDropIndicator() {
    if (!this.dropIndicatorElement) {
      return;
    }

    if (this.dropIndicatorElement.dataset.dropPositionOwner === this.idValue) {
      delete this.dropIndicatorElement.dataset.dropPosition;
      delete this.dropIndicatorElement.dataset.dropPositionOwner;
    }

    this.dropIndicatorElement = undefined;
  }

  private resolveDropIndicator(edge:Edge):{ element:HTMLElement; edge:Edge } {
    if (edge !== 'bottom') {
      return { element: this.element, edge };
    }

    const nextItem = this.element.nextElementSibling;

    if (
      nextItem instanceof HTMLElement &&
      nextItem.matches(sortableItemSelector) &&
      !nextItem.hasAttribute('data-dragging')
    ) {
      return { element: nextItem, edge: 'top' };
    }

    return { element: this.element, edge };
  }

  private getItemData():SortableItemData {
    return sortableItemData({
      itemId: this.idValue,
      moveUrl: this.moveUrlValue || undefined,
      type: this.typeValue,
    });
  }

  private registerDraggable():CleanupFn {
    return draggable({
      element: this.element,
      ...(this.hasHandleTarget ? { dragHandle: this.handleTarget } : {}),
      canDrag: ({ input }) => this.canDragFromPoint(input.clientX, input.clientY),
      getInitialData: () => this.getItemData(),
      onDragStart: () => {
        preventUnhandled.start();
        this.element.setAttribute('data-dragging', 'source');
      },
      onDrop: () => {
        preventUnhandled.stop();
        this.clearDropIndicator();
        this.element.removeAttribute('data-dragging');
      },
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          render: ({ container }) => this.renderPreview(container),
        });
      },
    });
  }

  private canDragFromPoint(clientX:number, clientY:number):boolean {
    if (this.element.closest(sortableListsRootSelector)?.hasAttribute(sortableListsMovingAttribute)) {
      return false;
    }

    const target = this.element.ownerDocument.elementFromPoint(clientX, clientY);

    if (!(target instanceof Element) || !this.element.contains(target)) {
      return true;
    }

    const dragHandle = this.hasHandleTarget ? this.handleTarget : this.element;

    return closestInteractiveElement(target, dragHandle) == null;
  }

  private renderPreview(container:HTMLElement) {
    const previewWidth = this.previewTarget.getBoundingClientRect().width;
    const preview = this.previewTarget.cloneNode(true) as HTMLElement;

    this.sanitizePreview(preview);
    preview.setAttribute('data-preview', '');

    if (previewWidth > 0) {
      preview.style.width = `${previewWidth}px`;
    }

    container.append(preview);
  }

  private sanitizePreview(element:HTMLElement) {
    const nodes = [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))];

    for (const node of nodes) {
      node.removeAttribute('data-controller');
      node.removeAttribute('data-action');
      node.removeAttribute('data-dragging');
      node.removeAttribute('data-drop-position');
      node.removeAttribute('data-drop-position-owner');
      node.removeAttribute('aria-describedby');
      node.removeAttribute('aria-disabled');
      node.removeAttribute('aria-roledescription');

      for (const attribute of Array.from(node.attributes)) {
        if (/^data-.+--.+-target$/.test(attribute.name)) {
          node.removeAttribute(attribute.name);
        }
      }
    }
  }

  private registerDropTarget():CleanupFn {
    return dropTargetForElements({
      element: this.element,
      canDrop: ({ source }) => {
        return isSortableItemData(source.data) && source.data.itemId !== this.idValue;
      },
      getData: ({ input }) => {
        return attachClosestEdge(this.getItemData(), {
          element: this.element,
          input,
          allowedEdges: ['top', 'bottom'],
        });
      },
      getIsSticky: () => true,
      onDragEnter: ({ self }) => {
        const closestEdge = extractClosestEdge(self.data);
        this.renderDropIndicator(closestEdge);
      },
      onDrag: ({ self }) => {
        const closestEdge = extractClosestEdge(self.data);
        this.renderDropIndicator(closestEdge);
      },
      onDragLeave: () => {
        this.clearDropIndicator();
      },
      onDrop: () => {
        this.clearDropIndicator();
      },
    });
  }

  private registerHandleAccessibility():CleanupFn {
    if (!this.hasHandleTarget) {
      return () => undefined;
    }

    const handle = this.handleTarget;
    const restoreHandleAttributes = this.captureAttributes(handle, [
      'aria-describedby',
      'aria-disabled',
      'aria-pressed',
      'aria-roledescription',
      'role',
    ]);
    const description = this.createHandleDescription();
    const root = this.element.closest(sortableListsRootSelector);
    const observer = root ? new MutationObserver(() => this.updateHandleDisabled(handle)) : undefined;

    this.element.append(description);
    this.updateHandleRole(handle);
    handle.setAttribute('aria-roledescription', 'draggable');
    this.addDescriptionReference(handle, description.id);
    this.updateHandleDisabled(handle);
    this.updateHandlePressed(handle);
    if (observer && root) {
      observer.observe(root, {
        attributeFilter: [sortableListsMovingAttribute],
        attributes: true,
      });
    }

    return () => {
      observer?.disconnect();
      description.remove();
      restoreHandleAttributes();
    };
  }

  private updateHandleRole(handle:HTMLElement):void {
    if (handle.tagName !== 'BUTTON' && !handle.hasAttribute('role')) {
      handle.setAttribute('role', 'button');
    }
  }

  private registerHandleKeyboardSorting():CleanupFn {
    if (!this.hasHandleTarget) {
      return () => undefined;
    }

    const handle = this.handleTarget;
    const listener = (event:KeyboardEvent) => this.handleKeyboardSorting(event);

    handle.addEventListener('keydown', listener);

    return () => {
      handle.removeEventListener('keydown', listener);
    };
  }

  private handleKeyboardSorting(event:KeyboardEvent):void {
    if (
      event.target instanceof Element &&
      closestInteractiveElement(event.target, this.handleTarget) !== null
    ) {
      return;
    }

    if (event.key === ' ') {
      this.toggleKeyboardSorting(event);
      return;
    }

    if (event.key === 'Escape' && this.keyboardSorting) {
      event.preventDefault();
      event.stopPropagation();
      this.clearKeyboardSorting();
      return;
    }

    if (!this.keyboardSorting || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.moveKeyboardDropIndicator(event.key === 'ArrowDown' ? 1 : -1);
  }

  private toggleKeyboardSorting(event:KeyboardEvent):void {
    if (
      !this.keyboardSorting &&
      this.element.closest(sortableListsRootSelector)?.hasAttribute(sortableListsMovingAttribute)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (this.keyboardSorting) {
      this.dispatchKeyboardDrop();
      this.clearKeyboardSorting();
      return;
    }

    this.keyboardSorting = true;
    this.keyboardDropIndex = this.getKeyboardListItems().indexOf(this.element);
    this.element.toggleAttribute('data-dragging', this.keyboardSorting);
    this.element.dataset.dragging = 'source';

    this.updateHandlePressed(this.handleTarget);
  }

  private clearKeyboardSorting():void {
    this.keyboardSorting = false;
    this.keyboardDropIndex = undefined;
    this.clearDropIndicator();
    this.element.removeAttribute('data-dragging');
    this.updateHandlePressed(this.handleTarget);
  }

  private moveKeyboardDropIndicator(offset:number):void {
    const items = this.getKeyboardListItems();
    const dropTargets = items.filter((item) => item !== this.element);

    if (dropTargets.length === 0) {
      return;
    }

    const currentIndex = this.keyboardDropIndex ?? items.indexOf(this.element);
    const nextIndex = Math.max(0, Math.min(dropTargets.length, currentIndex + offset));

    this.keyboardDropIndex = nextIndex;
    this.clearDropIndicator();

    if (nextIndex < dropTargets.length) {
      this.renderDropIndicatorOn(dropTargets[nextIndex], 'top');
    } else {
      this.renderDropIndicatorOn(dropTargets[dropTargets.length - 1], 'bottom');
    }
  }

  private dispatchKeyboardDrop():void {
    const list = this.element.closest<HTMLElement>(sortableListSelector);

    if (!list) {
      return;
    }

    this.element.dispatchEvent(new CustomEvent<SortableItemKeyboardDropDetail>(sortableItemKeyboardDropEvent, {
      bubbles: true,
      detail: {
        sourceData: this.getItemData(),
        sourceElement: this.element,
        list,
        previousItemId: this.keyboardPreviousItemId(),
      },
    }));
  }

  private keyboardPreviousItemId():string|null {
    const dropTargets = this.getKeyboardListItems().filter((item) => item !== this.element);
    const dropIndex = this.keyboardDropIndex ?? 0;

    if (dropIndex === 0) {
      return null;
    }

    return dropTargets[Math.min(dropIndex, dropTargets.length) - 1]?.getAttribute('data-sortable-lists--item-id-value') ?? null;
  }

  private getKeyboardListItems():HTMLElement[] {
    const list = this.element.closest(sortableListSelector);

    if (!list) {
      return [this.element];
    }

    return Array.from(list.querySelectorAll<HTMLElement>(':scope > li, :scope > ul > li'))
      .filter((item) => item.matches(sortableItemSelector));
  }

  private captureAttributes(element:HTMLElement, attributes:string[]):CleanupFn {
    const originalAttributes = new Map(attributes.map((attribute) => [
      attribute,
      element.getAttribute(attribute),
    ]));

    return () => {
      originalAttributes.forEach((value, attribute) => {
        if (value === null) {
          element.removeAttribute(attribute);
        } else {
          element.setAttribute(attribute, value);
        }
      });
    };
  }

  private createHandleDescription():HTMLElement {
    const description = document.createElement('span');
    const id = ItemController.nextDescriptionId += 1;

    description.id = `sortable-lists-drag-handle-instructions-${id}`;
    description.classList.add('sr-only');
    description.textContent = this.dragHandleInstructions;

    return description;
  }

  private addDescriptionReference(element:HTMLElement, descriptionId:string):void {
    attributeTokenList(element, 'aria-describedby').add(descriptionId);
  }

  private updateHandleDisabled(handle:HTMLElement):void {
    handle.setAttribute(
      'aria-disabled',
      this.element.closest(sortableListsRootSelector)?.hasAttribute(sortableListsMovingAttribute) ? 'true' : 'false',
    );
  }

  private updateHandlePressed(handle:HTMLElement):void {
    handle.setAttribute('aria-pressed', this.keyboardSorting ? 'true' : 'false');
  }

  private get dragHandleInstructions():string {
    const key = 'js.sortable_lists.drag_handle.instructions';
    const translation = I18n.t(key);
    const fallback = 'Press Space to pick up this item. Use Up and Down arrow keys to choose a position. Press Space again to drop. Press Escape to cancel.';

    return translation === key || translation.startsWith('[missing ') ? fallback : translation;
  }

  private registerTurboMorphRefresh():CleanupFn {
    document.addEventListener('turbo:morph-element', this.refreshAfterMorphBound);

    return () => {
      document.removeEventListener('turbo:morph-element', this.refreshAfterMorphBound);
    };
  }

  private refreshAfterMorph(event:Event) {
    if (event.target !== this.element) {
      return;
    }

    this.disconnect();
    this.connect();
  }
}
