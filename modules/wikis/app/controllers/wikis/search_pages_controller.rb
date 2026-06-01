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
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
#
# See COPYRIGHT and LICENSE files for more details.
#++

module Wikis
  class SearchPagesController < ApplicationController
    include Dry::Monads[:result]

    no_authorization_required! :show

    def show
      provider = Provider.find(params.expect(:provider_id))
      query = params[:query]
      form_name = params[:name]
      builder = ActionView::Helpers::FormBuilder.new("", nil, view_context, {})

      @search_result = search_pages(query, provider)

      render layout: false, locals: { builder:, name: form_name }
    end

    private

    def search_pages(query, provider)
      return Success([]) if query.blank?

      Adapters::Input::SearchPages.build(query:).bind do |input_data|
        provider.auth_strategy_for(current_user).bind do |auth_strategy|
          provider.resolve("queries.search_pages").call(input_data:, auth_strategy:)
        end
      end
    end
  end
end
