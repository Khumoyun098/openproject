# frozen_string_literal: true

#-- copyright
# OpenProject is an open source project management software.
# Copyright (C) the OpenProject GmbH
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2013 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See COPYRIGHT and LICENSE files for more details.
#++

require "spec_helper"
require "json"

RSpec.describe "Backlogs native drag probe", :js, :selenium do
  create_shared_association_defaults_for_work_package_factory

  before do
    skip "Set BACKLOGS_NATIVE_DND_PROBE=1 to run this diagnostic spec" unless ENV["BACKLOGS_NATIVE_DND_PROBE"] == "1"
  end

  let(:attempts) { Integer(ENV.fetch("BACKLOGS_NATIVE_DND_ATTEMPTS", "10"), 10) }
  let(:mode) { ENV.fetch("BACKLOGS_NATIVE_DND_MODE", "edge") }

  let!(:project) do
    create(:project, enabled_module_names: %w[work_package_tracking backlogs])
  end
  let!(:bucket) { create(:backlog_bucket, project:, name: "Native drag probe bucket") }
  let!(:work_packages) do
    Array.new(4) do |index|
      create(:work_package, project:, backlog_bucket: bucket, position: index + 1)
    end
  end

  current_user do
    create(:user,
           member_with_permissions: {
             project => %i[view_sprints view_work_packages create_sprints manage_sprint_items edit_work_packages]
           })
  end

  it "reports whether native Selenium drag reaches Pragmatic DnD consistently" do
    failures = []

    attempts.times do |attempt|
      reset_bucket_order!
      visit project_backlogs_backlog_path(project)
      expect(page).to have_css(bucket_selector)

      before_order = item_ids_in_bucket
      source_id, = before_order
      target_id = before_order.fetch(2)

      source_metadata = element_metadata(item_selector(source_id))
      target_metadata = element_metadata(item_selector(target_id))

      install_drag_event_probe
      action_metadata = native_drag(source_id:, target_id:)

      expected_order = before_order[1..2].insert(1, source_id) + before_order[3..]
      matched = bucket_order_matches?(expected_order)
      after_order = item_ids_in_bucket
      event_log = drag_event_log

      unless matched
        failures << {
          attempt: attempt + 1,
          mode:,
          source_id:,
          target_id:,
          before_order:,
          expected_order:,
          after_order:,
          source_metadata:,
          target_metadata:,
          action_metadata:,
          event_counts: event_counts(event_log),
          last_events: event_log.last(20)
        }
      end
    ensure
      stop_drag_event_probe
    end

    expect(failures).to be_empty, JSON.pretty_generate(failures)
  end

  def native_drag(source_id:, target_id:)
    source = find(item_selector(source_id))
    target = find(item_selector(target_id))
    source_rect = source.native.rect
    target_rect = target.native.rect
    action_metadata = {
      source_rect: rect_data(source_rect),
      target_rect: rect_data(target_rect)
    }

    scroll_to_element(source)

    case mode
    when "element"
      action_metadata[:action] = "drag_and_drop"
      page.driver.browser.action.drag_and_drop(source.native, target.native).perform
    when "offset"
      action_metadata.merge!(
        action: "drag_and_drop_by",
        offset_x: target_rect.x - source_rect.x,
        offset_y: target_rect.y - source_rect.y
      )

      page
        .driver
        .browser
        .action
        .drag_and_drop_by(
          source.native,
          action_metadata.fetch(:offset_x),
          action_metadata.fetch(:offset_y)
        )
        .perform
    when "edge"
      target_offset_y = -(target.native.rect.height / 2) + 6
      action_metadata.merge!(
        action: "click_hold_move_to_edge_release",
        target_offset_x: 0,
        target_offset_y:
      )

      page
        .driver
        .browser
        .action
        .move_to(source.native)
        .click_and_hold(source.native)
        .perform

      sleep 0.2

      page
        .driver
        .browser
        .action
        .move_to(target.native, 0, target_offset_y)
        .perform

      sleep 0.2

      page
        .driver
        .browser
        .action
        .release
        .perform
    else
      raise ArgumentError, "Unknown BACKLOGS_NATIVE_DND_MODE=#{mode.inspect}; use edge, element, or offset"
    end

    action_metadata
  end

  def element_metadata(selector)
    page.evaluate_script(<<~JS, selector)
      (() => {
        const element = document.querySelector(arguments[0]);

        if (!element) {
          return { found: false, selector: arguments[0] };
        }

        const rect = element.getBoundingClientRect();
        const draggable = element.closest('[draggable="true"]');
        const row = element.closest('.Box-row');

        return {
          found: true,
          selector: arguments[0],
          tagName: element.tagName,
          className: element.className,
          draggableAttribute: element.getAttribute('draggable'),
          isDraggableProperty: element.draggable,
          closestDraggableTagName: draggable?.tagName ?? null,
          closestDraggableClassName: draggable?.className ?? null,
          closestDraggableItemId: draggable
            ?.getAttribute('data-sortable-lists--item-id-value') ?? null,
          rowClassName: row?.className ?? null,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        };
      })()
    JS
  end

  def rect_data(rect)
    {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }
  end

  def install_drag_event_probe
    page.execute_script(<<~JS)
      window.__backlogsNativeDndProbeAbort?.abort();

      const controller = new AbortController();
      const events = [];
      const types = [
        'mousedown',
        'mousemove',
        'mouseup',
        'dragstart',
        'dragenter',
        'dragover',
        'dragleave',
        'drop',
        'dragend'
      ];

      function itemIdFor(element) {
        const closestItem = element?.closest?.('[data-sortable-lists--item-id-value]');
        const descendantItem = element?.querySelector?.('[data-sortable-lists--item-id-value]');

        return (closestItem ?? descendantItem)
          ?.getAttribute('data-sortable-lists--item-id-value') ?? null;
      }

      function dropPositions() {
        return Array
          .from(document.querySelectorAll('[data-drop-position]'))
          .map((element) => ({
            itemId: itemIdFor(element),
            position: element.getAttribute('data-drop-position')
          }));
      }

      function pushEvent(event) {
        events.push({
          type: event.type,
          targetItemId: itemIdFor(event.target),
          clientX: event.clientX,
          clientY: event.clientY,
          defaultPrevented: event.defaultPrevented,
          dropEffect: event.dataTransfer?.dropEffect ?? null,
          effectAllowed: event.dataTransfer?.effectAllowed ?? null,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          draggingCount: document.querySelectorAll('[data-dragging]').length,
          honeyPotCount: document.querySelectorAll('[data-pdnd-honey-pot]').length,
          dropPositions: dropPositions(),
          time: Math.round(performance.now())
        });

        if (events.length > 500) {
          events.shift();
        }
      }

      types.forEach((type) => {
        document.addEventListener(type, pushEvent, { signal: controller.signal });
      });

      window.__backlogsNativeDndProbeAbort = controller;
      window.__backlogsNativeDndProbeEvents = events;
    JS
  end

  def stop_drag_event_probe
    page.execute_script("window.__backlogsNativeDndProbeAbort?.abort();")
  end

  def drag_event_log
    page.evaluate_script("window.__backlogsNativeDndProbeEvents || []")
  end

  def event_counts(event_log)
    event_log.group_by { |event| event.fetch("type") }.transform_values(&:count)
  end

  def item_ids_in_bucket
    page.all("#{bucket_selector} [data-sortable-lists--item-id-value]", minimum: work_packages.length).map do |element|
      element["data-sortable-lists--item-id-value"]
    end
  end

  def reset_bucket_order!
    work_packages.each_with_index do |work_package, index|
      work_package.reload.update!(backlog_bucket: bucket, position: index + 1)
    end
  end

  def bucket_order_matches?(expected_order)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 3

    loop do
      return true if item_ids_in_bucket == expected_order
      return false if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline

      sleep 0.05
    end
  end

  def item_selector(work_package_id)
    "#{test_selector("work-package-#{work_package_id}")}[data-sortable-lists--item-id-value]"
  end

  def bucket_selector
    test_selector("backlog-bucket-#{bucket.id}")
  end
end
