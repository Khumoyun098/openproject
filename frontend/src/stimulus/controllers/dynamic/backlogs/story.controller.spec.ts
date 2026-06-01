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

import { Application } from '@hotwired/stimulus';

import type StoryControllerType from './story.controller';

describe('Backlogs story controller', () => {
  const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  let application:Application;
  let fixture:HTMLElement;
  let StoryController:typeof StoryControllerType;

  beforeAll(async () => {
    ({ default: StoryController } = await import('./story.controller'));
  });

  beforeEach(() => {
    fixture = document.createElement('div');
    document.body.appendChild(fixture);

    application = Application.start();
    application.register('backlogs--story', StoryController);
  });

  afterEach(() => {
    application.stop();
    fixture.remove();
  });

  function renderStory() {
    fixture.innerHTML = `
      <article
        data-controller="backlogs--story"
        data-backlogs--story-id-value="42"
        data-backlogs--story-display-id-value="SP-42"
        data-backlogs--story-split-url-value="/projects/demo/backlogs/details/SP-42"
        data-backlogs--story-full-url-value="/work_packages/42"
        data-backlogs--story-selected-class="Box-row--blue"
        tabindex="0"
      >
        Story
      </article>
    `;

    return fixture.querySelector<HTMLElement>('[data-controller="backlogs--story"]')!;
  }

  it('prevents Space from scrolling the page without activating the card', async () => {
    const story = renderStory();
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });

    await nextFrame();
    story.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
