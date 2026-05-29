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

export default class AddExistingPageController extends Controller {
  static targets = [
    'searchInput',
    'searchResultsFrame'
  ];

  declare readonly searchInputTarget:HTMLInputElement;
  declare readonly searchResultsFrameTarget:FrameElement;

  private debouncedSearch:DebouncedFunc<(event:InputEvent) => void>;

  connect() {
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

  private isInputElement(target:EventTarget|null):target is HTMLInputElement {
    return target !== null && target instanceof HTMLInputElement;
  }

  private searchWikiPages(query:string) {
    const url = 'https://openproject.internal/search_wiki_pages';
    const params = new URLSearchParams();
    params.set('query', query);
    params.set('provider_id', '1');

    this.searchResultsFrameTarget.src = `${url}?${params}`;
  }
}
