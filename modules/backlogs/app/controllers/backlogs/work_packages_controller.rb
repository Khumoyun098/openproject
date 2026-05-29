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

module Backlogs
  class WorkPackagesController < BaseController
    include OpTurbo::ComponentStream

    before_action :load_work_package

    # Deferred ActionMenu items (Primer include-fragment).
    def menu
      render(Backlogs::WorkPackageCardMenuComponent.new(
               project: @project,
               work_package: work_package_with_backlog_neighbours,
               open_sprints_exist: open_sprints_exist?,
               other_buckets_exist: other_buckets_exist?,
               current_user:
             ),
             layout: false)
    end

    def move_to_sprint_dialog
      respond_with_dialog Backlogs::MoveToSprintDialogComponent.new(
        work_package: @work_package,
        project: @project,
        move_action: move_project_backlogs_work_package_path(@project, @work_package, helpers.all_backlogs_params)
      )
    end

    def move_to_backlog_bucket_dialog
      respond_with_dialog Backlogs::MoveToBacklogBucketDialogComponent.new(
        work_package: @work_package,
        project: @project,
        move_action: move_project_backlogs_work_package_path(@project, @work_package, helpers.all_backlogs_params)
      )
    end

    def move
      # Capture the source before the call; the service reloads @work_package internally via #move_after.
      source = @work_package.sprint

      call = Stories::UpdateService.new(user: current_user, story: @work_package)
                                   .call(**move_params.to_h.symbolize_keys)

      if call.success?
        move_work_package_to_target_component_via_turbo_stream(source:, target: call.result.sprint)
      else
        render_error_flash_message_via_turbo_stream(
          message: I18n.t(:notice_unsuccessful_update_with_reason, reason: call.message)
        )
      end

      respond_with_turbo_streams(status: call)
    end

    private

    def move_work_package_to_target_component_via_turbo_stream(source:, target:)
      if source != target
        replace_component_via_turbo_stream(source)
      end

      replace_component_via_turbo_stream(target)
    end

    def replace_component_via_turbo_stream(container)
      component = if container
                    sprint_component(sprint: container)
                  else
                    backlog_component
                  end

      replace_via_turbo_stream(component:, method: :morph)
    end

    def sprint_component(sprint:)
      Backlogs::SprintComponent.new(sprint:, project: @project)
    end

    def backlog_component
      inbox_work_packages = WorkPackage.backlogs_inbox_for(project: @project)
      buckets = BacklogBucket.for_project(@project)

      Backlogs::BacklogComponent.new(inbox_work_packages:, buckets:, project: @project)
    end

    def load_work_package
      @work_packages = WorkPackage.visible.where(project: @project).order_by_position
      @work_package = @work_packages.find(params.expect(:id))
    end

    def move_params
      params.permit(:position, :prev_id, :target_id, :direction)
    end

    def displayed_work_packages
      if @work_package.sprint_id?
        @work_packages.where(sprint_id: @work_package.sprint_id)
      elsif @work_package.backlog_bucket_id?
        @work_packages.merge(@work_package.backlog_bucket.displayed_work_packages)
      else
        @work_packages.merge(WorkPackage.backlogs_inbox_for(project: @project))
      end
    end

    def work_package_with_backlog_neighbours
      displayed_work_packages.with_backlogs_neighbours.find(@work_package.id)
    end

    def open_sprints_exist?
      Sprint.for_project(@project).visible
                                  .not_completed
                                  .where.not(id: @work_package.sprint_id)
                                  .exists?
    end

    def other_buckets_exist?
      BacklogBucket.where(project: @project)
                   .where.not(id: @work_package.backlog_bucket_id)
                   .exists?
    end
  end
end
