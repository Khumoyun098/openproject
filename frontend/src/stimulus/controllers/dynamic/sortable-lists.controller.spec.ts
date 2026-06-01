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

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */

import { Application } from '@hotwired/stimulus';

import type { autoScrollForElements as autoScrollForElementsFn } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import type { dropTargetForElements as dropTargetForElementsFn, monitorForElements as monitorForElementsFn } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { FetchRequest as FetchRequestFn } from '@rails/request.js';
import type SortableListsControllerType from './sortable-lists.controller';
import type { sortableItemData as sortableItemDataFn } from './sortable-lists/drag-and-drop';

describe('Sortable lists controller', () => {
  const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve));

  let FetchRequest:typeof FetchRequestFn;
  let dropTargetForElements:typeof dropTargetForElementsFn;
  let monitorForElements:typeof monitorForElementsFn;
  let autoScrollForElements:typeof autoScrollForElementsFn;
  let SortableListsController:typeof SortableListsControllerType;
  let sortableItemData:typeof sortableItemDataFn;

  let application:Application;
  let fixture:HTMLElement;
  let loadingIndicator:HTMLElement;

  beforeAll(async () => {
    vi.doMock('@rails/request.js', () => ({
      FetchRequest: vi.fn(function FetchRequest() {
        return {
          perform: vi.fn(() => Promise.resolve({ ok: true })),
        };
      }),
    }));

    vi.doMock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
      draggable: vi.fn(() => vi.fn()),
      dropTargetForElements: vi.fn(() => vi.fn()),
      monitorForElements: vi.fn(() => vi.fn()),
    }));

    vi.doMock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({
      autoScrollForElements: vi.fn(() => vi.fn()),
    }));

    ({ FetchRequest } = await import('@rails/request.js'));
    ({ dropTargetForElements, monitorForElements } = await import('@atlaskit/pragmatic-drag-and-drop/element/adapter'));
    ({ autoScrollForElements } = await import('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element'));
    ({ default: SortableListsController } = await import('./sortable-lists.controller'));
    ({ sortableItemData } = await import('./sortable-lists/drag-and-drop'));
  });

  function input() {
    return {
      altKey: false,
      button: 0,
      buttons: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      clientX: 10,
      clientY: 10,
      pageX: 10,
      pageY: 10,
    };
  }

  function itemRow(id:string, { moveUrl = '/move' }:{ moveUrl?:string|null } = {}):HTMLLIElement {
    const row = document.createElement('li');

    row.setAttribute('data-sortable-lists--item-id-value', id);
    row.setAttribute('data-sortable-lists--item-type-value', 'work_package');
    if (moveUrl) {
      row.setAttribute('data-sortable-lists--item-move-url-value', moveUrl);
    }

    return row;
  }

  function renderFixture({
    acceptedType = null,
    moveUrlTemplate = null,
    itemMoveUrl = '/move',
  }:{
    acceptedType?:string|null;
    moveUrlTemplate?:string|null;
    itemMoveUrl?:string|null;
  } = {}) {
    fixture.innerHTML = `
      <div
        data-controller="sortable-lists"
        ${acceptedType ? `data-sortable-lists-accepted-type-value="${acceptedType}"` : ''}
        ${moveUrlTemplate ? `data-sortable-lists-move-url-template-value="${moveUrlTemplate}"` : ''}
      >
        <ul data-sortable-lists-target="list" data-sortable-lists-list-type="backlog_bucket" data-sortable-lists-list-id="1"></ul>
        <ul data-sortable-lists-target="list" data-sortable-lists-list-type="sprint" data-sortable-lists-list-id="1"></ul>
      </div>
    `;

    const [sourceList, targetList] = Array.from(fixture.querySelectorAll<HTMLElement>('[data-sortable-lists-target="list"]'));
    const root = fixture.querySelector<HTMLElement>('[data-controller="sortable-lists"]')!;

    sourceList.append(itemRow('1', { moveUrl: itemMoveUrl }), itemRow('2', { moveUrl: itemMoveUrl }), itemRow('3', { moveUrl: itemMoveUrl }));
    targetList.append(itemRow('4', { moveUrl: itemMoveUrl }), itemRow('5', { moveUrl: itemMoveUrl }));

    return {
      root,
      sourceList,
      targetList,
      firstSourceItem: sourceList.querySelector<HTMLElement>('[data-sortable-lists--item-id-value="1"]')!,
    };
  }

  function renderScrollableFixture(values = '') {
    fixture.innerHTML = `
      <div data-controller="sortable-lists" ${values}>
        <div data-sortable-lists-target="scrollable"></div>
      </div>
    `;

    return fixture.querySelector<HTMLElement>('[data-sortable-lists-target="scrollable"]')!;
  }

  async function dropCurrentItemOnList(sourceElement:HTMLElement, list:HTMLElement) {
    const monitorOptions = vi.mocked(monitorForElements).mock.lastCall?.[0];

    await monitorOptions?.onDrop?.({
      source: sourcePayload(
        sourceElement,
        itemData(
          sourceElement.getAttribute('data-sortable-lists--item-id-value')!,
          'work_package',
          sourceElement.getAttribute('data-sortable-lists--item-move-url-value') ?? undefined,
        ),
      ),
      location: {
        initial: {
          dropTargets: [],
          input: input(),
        },
        current: {
          dropTargets: [
            dropTargetRecord(
              list,
              {
                type: list.getAttribute('data-sortable-lists-list-type'),
                listId: list.getAttribute('data-sortable-lists-list-id'),
              },
            ),
          ],
          input: input(),
        },
        previous: {
          dropTargets: [],
        },
      },
    });
  }

  function itemData(itemId = '1', type = 'work_package', moveUrl?:string) {
    return sortableItemData({ itemId, moveUrl, type });
  }

  function sourcePayload(element:HTMLElement, data:Record<string|symbol, unknown> = itemData()) {
    return {
      data,
      dragHandle: null,
      element,
    };
  }

  function dropTargetRecord(element:HTMLElement, data:Record<string|symbol, unknown>) {
    return {
      data,
      dropEffect: 'move' as const,
      element,
      isActiveDueToStickiness: false,
    };
  }

  function dropTargetOptionsFor(element:HTMLElement) {
    return vi.mocked(dropTargetForElements).mock.calls.find(([options]) => options.element === element)?.[0];
  }

  beforeEach(() => {
    vi.clearAllMocks();

    fixture = document.createElement('div');
    loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'global-loading-indicator';
    loadingIndicator.hidden = true;
    document.body.appendChild(fixture);
    document.body.appendChild(loadingIndicator);

    application = Application.start();
    application.register('sortable-lists', SortableListsController);
  });

  afterEach(() => {
    application.stop();
    fixture.remove();
    loadingIndicator.remove();
  });

  it('does not turn a list-only drop onto the source list into an append move', async () => {
    const { sourceList, firstSourceItem } = renderFixture();

    await nextFrame();
    await dropCurrentItemOnList(firstSourceItem, sourceList);

    expect(FetchRequest).not.toHaveBeenCalled();
  });

  it('appends the item when list-only dropping onto another list', async () => {
    const { targetList, firstSourceItem } = renderFixture();

    await nextFrame();
    await dropCurrentItemOnList(firstSourceItem, targetList);

    expect(FetchRequest).toHaveBeenCalledOnce();

    const options = vi.mocked(FetchRequest).mock.lastCall?.[2] as { body:FormData };

    expect(options.body.get('list_type')).toEqual('sprint');
    expect(options.body.get('list_id')).toEqual('1');
    expect(options.body.get('prev_item_id')).toEqual('5');
  });

  it('moves the item when receiving a keyboard drop request', async () => {
    const { root, targetList, firstSourceItem } = renderFixture();

    await nextFrame();
    firstSourceItem.dispatchEvent(new CustomEvent('sortable-lists:item-keyboard-drop', {
      bubbles: true,
      detail: {
        sourceData: itemData('1', 'work_package', '/move'),
        sourceElement: firstSourceItem,
        list: targetList,
        previousItemId: '5',
      },
    }));
    await flushPromises();

    expect(FetchRequest).toHaveBeenCalledOnce();

    const options = vi.mocked(FetchRequest).mock.lastCall?.[2] as { body:FormData };

    expect(root.hasAttribute('data-sortable-lists-moving')).toBe(false);
    expect(options.body.get('list_type')).toEqual('sprint');
    expect(options.body.get('list_id')).toEqual('1');
    expect(options.body.get('prev_item_id')).toEqual('5');
  });

  it('builds the move URL from the controller URI template', async () => {
    const { targetList, firstSourceItem } = renderFixture({
      moveUrlTemplate: '/projects/demo/backlogs/work_packages/{id}/move',
      itemMoveUrl: null,
    });

    await nextFrame();
    await dropCurrentItemOnList(firstSourceItem, targetList);

    expect(FetchRequest).toHaveBeenCalledWith(
      'put',
      '/projects/demo/backlogs/work_packages/1/move',
      expect.any(Object),
    );
  });

  it('uses the sortable item move URL before the controller URI template', async () => {
    const { targetList, firstSourceItem } = renderFixture({
      moveUrlTemplate: '/projects/demo/backlogs/work_packages/{id}/move',
      itemMoveUrl: '/custom/move',
    });

    await nextFrame();
    await dropCurrentItemOnList(firstSourceItem, targetList);

    expect(FetchRequest).toHaveBeenCalledWith(
      'put',
      '/custom/move',
      expect.any(Object),
    );
  });

  it('falls back to the sortable item move URL while item-specific endpoints still exist', async () => {
    const { targetList, firstSourceItem } = renderFixture();

    await nextFrame();
    await dropCurrentItemOnList(firstSourceItem, targetList);

    expect(FetchRequest).toHaveBeenCalledWith(
      'put',
      '/move',
      expect.any(Object),
    );
  });

  it('marks the sortable lists root and global loading indicator while moving an item', async () => {
    let resolveMove:(response:{ ok:boolean }) => void;

    vi.mocked(FetchRequest).mockImplementationOnce(function FetchRequest() {
      return {
        perform: vi.fn(() => new Promise<{ ok:boolean }>((resolve) => {
          resolveMove = resolve;
        })),
      };
    });

    const { root, targetList, firstSourceItem } = renderFixture();

    await nextFrame();
    await dropCurrentItemOnList(firstSourceItem, targetList);

    expect(root.dataset.sortableListsMoving).toEqual('true');
    expect(root.getAttribute('aria-busy')).toEqual('true');
    expect(loadingIndicator.hidden).toBe(false);

    resolveMove!({ ok: true });
    await flushPromises();

    expect(root.hasAttribute('data-sortable-lists-moving')).toBe(false);
    expect(root.hasAttribute('aria-busy')).toBe(false);
    expect(loadingIndicator.hidden).toBe(true);
  });

  it('rejects new sortable-list drags and drops while a move is pending', async () => {
    let resolveMove:(response:{ ok:boolean }) => void;

    vi.mocked(FetchRequest).mockImplementationOnce(function FetchRequest() {
      return {
        perform: vi.fn(() => new Promise<{ ok:boolean }>((resolve) => {
          resolveMove = resolve;
        })),
      };
    });

    const { targetList, firstSourceItem } = renderFixture();

    await nextFrame();
    await dropCurrentItemOnList(firstSourceItem, targetList);

    expect(vi.mocked(monitorForElements).mock.lastCall?.[0].canMonitor?.({
      source: sourcePayload(firstSourceItem),
      initial: {} as never,
    })).toBe(false);
    expect(dropTargetOptionsFor(targetList)?.canDrop?.({
      element: targetList,
      input: input(),
      source: sourcePayload(firstSourceItem),
    })).toBe(false);

    resolveMove!({ ok: true });
    await flushPromises();
  });

  it('dispatches an error toast when the move request rejects', async () => {
    const toastEvents:CustomEvent[] = [];
    const onToast = (event:Event) => toastEvents.push(event as CustomEvent);

    window.addEventListener('op:toasters:add', onToast);
    vi.mocked(FetchRequest).mockImplementationOnce(function FetchRequest() {
      return {
        perform: vi.fn(() => Promise.reject(new Error('Network failure'))),
      };
    });

    const { root, targetList, firstSourceItem } = renderFixture();

    await nextFrame();
    await dropCurrentItemOnList(firstSourceItem, targetList);
    await flushPromises();

    expect(toastEvents).toHaveLength(1);
    expect(toastEvents[0].detail).toEqual(expect.objectContaining({
      message: expect.any(String),
      type: 'error',
    }));
    expect(root.hasAttribute('data-sortable-lists-moving')).toBe(false);
    expect(loadingIndicator.hidden).toBe(true);

    window.removeEventListener('op:toasters:add', onToast);
  });

  it('registers Backlogs lists as drop targets', async () => {
    const { sourceList, targetList } = renderFixture();

    await nextFrame();

    expect(dropTargetForElements).toHaveBeenCalledWith(expect.objectContaining({
      element: sourceList,
    }));
    expect(dropTargetForElements).toHaveBeenCalledWith(expect.objectContaining({
      element: targetList,
    }));
  });

  it('accepts item drops when the source type matches the root accepted type', async () => {
    const { targetList, firstSourceItem } = renderFixture({ acceptedType: 'work_package' });

    await nextFrame();

    expect(dropTargetOptionsFor(targetList)?.canDrop?.({
      element: targetList,
      input: input(),
      source: sourcePayload(firstSourceItem, itemData('1', 'work_package')),
    })).toBe(true);
  });

  it('applies the accepted item type to every list target in the controller root', async () => {
    const { sourceList, targetList, firstSourceItem } = renderFixture({ acceptedType: 'work_package' });

    await nextFrame();

    for (const list of [sourceList, targetList]) {
      expect(dropTargetOptionsFor(list)?.canDrop?.({
        element: list,
        input: input(),
        source: sourcePayload(firstSourceItem, itemData('1', 'meeting_agenda_item')),
      })).toBe(false);
    }
  });

  it('rejects item drops when the source type does not match the root accepted type', async () => {
    const { targetList, firstSourceItem } = renderFixture({ acceptedType: 'work_package' });

    await nextFrame();

    expect(dropTargetOptionsFor(targetList)?.canDrop?.({
      element: targetList,
      input: input(),
      source: sourcePayload(firstSourceItem, itemData('1', 'meeting_agenda_item')),
    })).toBe(false);
  });

  it('registers scrollable targets for vertical sortable list auto-scrolling', async () => {
    const scrollable = renderScrollableFixture();

    await nextFrame();

    expect(autoScrollForElements).toHaveBeenCalledWith(expect.objectContaining({
      element: scrollable,
    }));

    const options = vi.mocked(autoScrollForElements).mock.lastCall?.[0];

    expect(options?.canScroll?.({
      element: scrollable,
      input: input(),
      source: sourcePayload(itemRow('1')),
    })).toBe(true);
    expect(options?.canScroll?.({
      element: scrollable,
      input: input(),
      source: sourcePayload(document.createElement('div'), { type: 'unrelated' }),
    })).toBe(false);
    expect(options?.getAllowedAxis?.({
      element: scrollable,
      input: input(),
      source: sourcePayload(itemRow('1')),
    })).toEqual('vertical');
    expect(options?.getConfiguration?.({
      element: scrollable,
      input: input(),
      source: sourcePayload(itemRow('1')),
    })).toEqual({ maxScrollSpeed: 'standard' });
  });

  it('cleans up scrollable target auto-scrolling on disconnect', async () => {
    const scrollableCleanup = vi.fn();
    vi.mocked(autoScrollForElements).mockReturnValue(scrollableCleanup);

    renderScrollableFixture();

    await nextFrame();

    fixture.innerHTML = '';
    await nextFrame();

    expect(scrollableCleanup).toHaveBeenCalledOnce();
  });
});
