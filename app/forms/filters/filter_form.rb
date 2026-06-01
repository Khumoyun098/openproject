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

# Renders the list of filter input fields (one row per available filter plus an
# "add filter" select) for a given query as part of a Primer form.
#
# Unlike most primer forms, this form does not declare a static set of inputs
# via the `form do |f| ... end` DSL. The set of inputs depends on the query's
# available and active filters and is built dynamically at render time. The
# form re-uses the builder of the surrounding `primer_form_with` so that the
# emitted field names match what the controller expects (top-level
# `operator_<filter>` and `<filter>_value` fields).
#
# Embed it in any primer form like a normal sub-form:
#
#   <%= primer_form_with(url: ...) do |f| %>
#     <%= f.text_field(name: :title) %>
#     <%= render(Filters::FilterForm.new(f, query: @query)) %>
#   <% end %>
#
# Customise the set of advertised filters by passing `allowed_filters:` (used
# by `Filter::FilterComponent` subclasses that restrict or reorder the list).
#
# By default the form does *not* attach the `filter--filters-form` Stimulus
# controller, because in the standard layout (e.g. `Projects::IndexSubHeaderComponent`)
# the controller has to sit on a common ancestor of the advanced filter form
# *and* the inline quick filter input so that `sendForm()` can collect values
# from both. For standalone embeds with no co-located quick filter, pass
# `wrap_with_controller: true` and the form will emit its own controller wrapper.
#
# Pass `hidden_input_name:` (e.g. `"filters"`) to also emit a hidden input
# bound to the Stimulus controller's `filtersInput` target. The controller
# keeps the field value in sync with the serialized filter selections so
# that a normal form submit carries the canonical filter string in
# `params[:<hidden_input_name>]` — no `sendForm` redirect needed.
#
# `output_format:` selects how the filter selection is serialized into the
# hidden field (and into the URL when `sendForm` redirects). Supported values:
#   * `:params` (default) — URL-style string: `name ~ "foo"&login ! "bar"`.
#   * `:json`             — JSON array: `[{"name":{"operator":"~","values":["foo"]}}, ...]`.
# Only meaningful when this form owns the controller (`wrap_with_controller: true`);
# otherwise the host's controller wrapper decides.
#
# `autocomplete_append_to:` forwards an `appendTo` selector (or DOM reference
# string ng-select understands, e.g. `"#my-dialog"` or `"body"`) to every
# autocompleter the form renders. Use this when the form is embedded in a
# Primer dialog or another container that clips overflow, so the dropdown
# portal renders outside that container instead of being clipped.
class Filters::FilterForm < ApplicationForm
  OUTPUT_FORMATS = %i[params json].freeze

  def initialize(query:,
                 allowed_filters: nil,
                 wrap_with_controller: false,
                 hidden_input_name: nil,
                 output_format: nil,
                 autocomplete_append_to: nil)
    super()
    @query = query
    @allowed_filters = allowed_filters || query.available_advanced_filters
    @wrap_with_controller = wrap_with_controller
    @hidden_input_name = hidden_input_name
    @output_format = validate_output_format(output_format)
    @autocomplete_append_to = autocomplete_append_to
  end

  # Skip the autofocus traversal `Primer::Forms::Base#before_render` performs:
  # it walks `inputs`, which requires a static `form do |f| ... end` block.
  # The sub-forms rendered via `FormList` run their own `before_render`.
  def before_render; end

  def perform_render(&)
    list = @view_context.render(Primer::Forms::FormList.new(*sub_forms))
    content = @hidden_input_name ? @view_context.safe_join([hidden_filters_input, list]) : list
    return content unless @wrap_with_controller

    # `op-filters-form -expanded` carries the layout styles for the filter
    # rows (label on its own line above operator/value) and makes the form
    # visible (`op-filters-form` alone is `display: none`).
    @view_context.content_tag(
      :div,
      content,
      class: "op-filters-form -expanded",
      data: controller_data_attributes
    )
  end

  private

  attr_reader :query, :allowed_filters

  def controller_data_attributes
    attrs = { controller: "filter--filters-form" }
    attrs["filter--filters-form-output-format-value"] = @output_format.to_s if @output_format
    attrs
  end

  def validate_output_format(format)
    return nil if format.nil?

    sym = format.to_sym
    unless OUTPUT_FORMATS.include?(sym)
      raise ArgumentError,
            "Unknown output_format #{format.inspect}; expected one of #{OUTPUT_FORMATS.inspect}"
    end
    sym
  end

  def hidden_filters_input
    @view_context.hidden_field_tag(
      @hidden_input_name,
      "",
      data: { "filter--filters-form-target": "filtersInput" }
    )
  end

  def sub_forms
    forms = map_filter do |filter, active, additional_attributes|
      filter_form_class(filter)
        .new(@builder, filter:, additional_attributes:, active:)
    end

    forms << Filters::Inputs::AddFilterForm.new(
      @builder,
      allowed_filters:,
      active_filter_names: query.filters.map(&:name)
    )
  end

  # Maps over all filters (active and inactive).
  # In case a filter is active, the active one will be preferred over the inactive one.
  def map_filter
    allowed_filters.map do |allowed_filter|
      active_filter = query.find_active_filter(allowed_filter.name)
      filter = active_filter || allowed_filter

      yield filter, active_filter.present?, additional_filter_attributes(filter)
    end
  end

  def additional_filter_attributes(filter)
    opts = filter.autocomplete_options
    opts = opts.merge(appendTo: @autocomplete_append_to) if @autocomplete_append_to
    opts.any? ? { autocomplete_options: opts } : {}
  end

  def filter_form_class(filter)
    if filter.is_a?(Queries::Filters::Shared::BooleanFilter)
      Filters::Inputs::BooleanForm
    elsif filter.autocomplete_options.any?
      Filters::Inputs::AutocompleteForm
    elsif filter.type.in? %i[list list_optional list_all]
      Filters::Inputs::ListForm
    elsif filter.type.in? %i[datetime_past date]
      Filters::Inputs::DateForm
    else
      Filters::Inputs::TextForm
    end
  end
end
