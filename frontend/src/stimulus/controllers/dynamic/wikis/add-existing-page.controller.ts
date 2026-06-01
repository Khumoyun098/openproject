/*
 * -- copyright
 * OpenProject is an open source project management software.
 * Copyright (C) the OpenProject GmbH
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License version 3.
 *
 * OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
 * Copyright (C) 2006-2013 Jean-Philippe Lang
 * Copyright (C) 2010-2013 the ChiliProject Team
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 *
 * See COPYRIGHT and LICENSE files for more details.
 * ++
 */

import { FrameElement } from '@hotwired/turbo';
import { Controller } from '@hotwired/stimulus';
import { debounce, DebouncedFunc } from 'lodash';

import { PathHelperService } from 'core-app/core/path-helper/path-helper.service';

export default class AddExistingPageController extends Controller {
  static targets = [
    'searchInput',
    'searchResultsFrame',
    'identifierInput',
  ];

  static values = {
    providerId: String,
  };

  declare readonly searchInputTarget:HTMLInputElement;
  declare readonly searchResultsFrameTarget:FrameElement;
  declare readonly identifierInputTarget:HTMLInputElement;

  declare readonly providerIdValue:string;

  private debouncedSearch:DebouncedFunc<(event:InputEvent) => void>;
  private pathHelper:PathHelperService;

  connect() {
    void window.OpenProject.getPluginContext().then((context) => {
      this.pathHelper = context.services.pathHelperService;
    });

    this.debouncedSearch = debounce((ev:InputEvent) => {
      const input = ev.target;
      if (!this.isInputElement(input)) return;

      const query = input.value;
      if (query.trim() === '') return;

      this.searchWikiPages(query);
    }, 500);
  }

  disconnect() {
    this.debouncedSearch.cancel();
  }

  search(event:InputEvent):void {
    this.debouncedSearch(event);
  }

  selectPage(event:CustomEvent<{ node:Node, previousCheckedValue:string }[]>):void {
    const selectedPage = event.detail[0]?.node;
    // Attention: the attribute `checkedValue` doesn't work, as it is always true and does not toggle
    const isChecked = event.detail[0]?.previousCheckedValue === 'false';
    if (!this.isTreeViewElement(selectedPage)) return;

    if (isChecked) {
      this.identifierInputTarget.value = selectedPage.dataset.identifier ?? '';
    } else {
      this.identifierInputTarget.value = '';
    }
  }

  private isInputElement(target:EventTarget|null):target is HTMLInputElement {
    return target !== null && target instanceof HTMLInputElement;
  }

  private isTreeViewElement(target:Node|null):target is HTMLDivElement {
    return target !== null &&
      target instanceof HTMLDivElement &&
      target.getAttribute('role') === 'treeitem';
  }

  private searchWikiPages(query:string) {
    void window.OpenProject.getPluginContext().then((context) => {
      const pathHelper = context.services.pathHelperService;
      this.searchResultsFrameTarget.src = pathHelper.searchWikiPages(query, this.providerIdValue);
    });
  }
}
