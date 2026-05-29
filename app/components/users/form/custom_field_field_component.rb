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

module Users
  module Form
    class CustomFieldFieldComponent < ApplicationComponent
      include ApplicationHelper

      def initialize(custom_field:, form:)
        super()
        @custom_field = custom_field
        @form = form
      end

      def field_options
        {
          custom_value: @form.object.custom_value_for(@custom_field),
          custom_field: @custom_field
        }
      end

      def css_classes
        ["form--field", @custom_field.attribute_name, required_class].compact
      end

      def container_class
        case @custom_field.field_format
        when "text" then "-xxwide"
        when "date" then "-xslim"
        else "-middle"
        end
      end

      private

      def required_class
        "-required" if @custom_field.is_required? && !@custom_field.boolean?
      end
    end
  end
end
