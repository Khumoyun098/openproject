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

require "rails_helper"

RSpec.describe Users::Profile::AttributesComponent, type: :component do
  shared_let(:logged_in_user) { create(:user) }
  let(:user) { build(:user) }
  let(:component) { described_class.new(user:) }

  current_user { logged_in_user }

  describe "render?" do
    subject { component.render? }

    context "when user has view_user_email permission" do
      before { create(:standard_global_role) }

      it { is_expected.to be(true) }
    end

    context "when user views its own profile" do
      current_user { user }

      it { is_expected.to be(true) }
    end

    context "when user has no view_user_email permission" do
      it { is_expected.to be(false) }
    end

    context "when user has a custom field with a present value" do
      let(:custom_field) { create(:user_custom_field, :string) }
      let(:user) { build(:user, custom_values: [build(:custom_value, custom_field:, value: "Hello")]) }

      it { is_expected.to be(true) }
    end

    context "when user has a custom field with a blank value" do
      let(:custom_field) { create(:user_custom_field, :string) }
      let(:user) { build(:user, custom_values: [build(:custom_value, custom_field:, value: "  ")]) }

      it { is_expected.to be(false) }
    end

    context "when user has a non-visible custom field with a present value" do
      let(:custom_field) { create(:user_custom_field, :string, admin_only: true) }
      let(:user) { build(:user, custom_values: [build(:custom_value, custom_field:, value: "Hello")]) }

      it { is_expected.to be(false) }
    end
  end

  describe "rendering custom fields" do
    let(:section)      { create(:user_custom_field_section, name: "Profile info") }
    let(:custom_field) { create(:user_custom_field, :string, admin_only:, user_custom_field_section: section) }
    let(:admin_only)   { false }
    let(:user)         { build_stubbed(:user, custom_values: [build(:custom_value, custom_field:, value: "Hello custom field")]) }

    current_user { build(:admin) }

    before { render_inline(component) }

    it "renders the field value" do
      expect(page).to have_text("Hello custom field")
    end

    it "renders the section name as a heading" do
      expect(page).to have_text("Profile info")
    end

    context "when admin_only and current user is not admin" do
      let(:admin_only) { true }

      current_user { logged_in_user }

      it "does not render the field" do
        expect(page).to have_no_text("Hello custom field")
      end
    end

    context "with an untitled section" do
      let(:section) do
        create(:user_custom_field_section).tap { |s| s.update_column(:name, nil) }
      end

      it "renders the I18n fallback label" do
        expect(page).to have_text(I18n.t("settings.user_attributes.label_untitled_section"))
      end
    end

    context "with fields in two sections" do
      let(:section_first)   { create(:user_custom_field_section, name: "First",  position: 1) }
      let(:section_second)  { create(:user_custom_field_section, name: "Second", position: 2) }
      let(:field_in_first)  { create(:user_custom_field, :string, name: "In first",  user_custom_field_section: section_first) }
      let(:field_in_second) { create(:user_custom_field, :string, name: "In second", user_custom_field_section: section_second) }
      let(:user) do
        build_stubbed(:user, custom_values: [
                        build(:custom_value, custom_field: field_in_first,  value: "Value A"),
                        build(:custom_value, custom_field: field_in_second, value: "Value B")
                      ])
      end

      it "renders section headings in position order" do
        expect(page.text).to match(/First.*Second/m)
      end

      it "renders each field under its own section heading" do
        expect(page.text).to match(/First.*In first.*Second.*In second/m)
      end
    end

    context "with multiple fields in one section" do
      let(:field_1) { create(:user_custom_field, :string, name: "Field 1", user_custom_field_section: section, position_in_custom_field_section: 1) }
      let(:field_2) { create(:user_custom_field, :string, name: "Field 2", user_custom_field_section: section, position_in_custom_field_section: 2) }
      let(:user) do
        build_stubbed(:user, custom_values: [
                        build(:custom_value, custom_field: field_1, value: "First value"),
                        build(:custom_value, custom_field: field_2, value: "Second value")
                      ])
      end

      it "renders fields in position_in_custom_field_section order" do
        items = page.all(:test_id, "user-custom-field")
        expect(items[0]).to have_text("Field 1")
        expect(items[1]).to have_text("Field 2")
      end
    end

    context "with multi-select and formattable fields" do
      let(:list_field) { create(:user_custom_field, :multi_list, name: "Ze list",   user_custom_field_section: section, position_in_custom_field_section: 2) }
      let(:text_field) { create(:user_custom_field, :text,       name: "A portrait", user_custom_field_section: section, position_in_custom_field_section: 1) }
      let(:user) do
        build_stubbed(:user, custom_values: [
                        build(:custom_value, custom_field: list_field, value: list_field.possible_values[0]),
                        build(:custom_value, custom_field: list_field, value: list_field.possible_values[1]),
                        build(:custom_value, custom_field: list_field, value: list_field.possible_values[2]),
                        build(:custom_value, custom_field: text_field, value: "This is **formatted** text.")
                      ])
      end

      it "renders multi-select values as a comma-separated list" do
        expect(page).to have_text("A, B, C")
      end

      it "renders formattable fields as HTML" do
        expect(page).to have_css("strong", text: "formatted")
      end

      it "orders fields by position_in_custom_field_section, not alphabetically" do
        items = page.all(:test_id, "user-custom-field")
        expect(items[0]).to have_text("A portrait")
        expect(items[1]).to have_text("Ze list")
      end
    end
  end
end
