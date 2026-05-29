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

RSpec.describe Users::Form::CustomFieldSectionsComponent, type: :component do
  let(:user)      { create(:user) }
  let(:form)      { instance_double(ActionView::Helpers::FormBuilder, object: user) }
  let(:component) { described_class.new(form:) }

  describe "#sections" do
    subject { component.sections }

    context "with no sections" do
      it { is_expected.to be_empty }
    end

    context "with a section containing visible fields" do
      let!(:section) { create(:user_custom_field_section) }
      let!(:field)   { create(:user_custom_field, :string, user_custom_field_section: section) }

      it "returns one section component" do
        expect(subject.size).to eq(1)
        expect(subject.first).to be_a(Users::Form::CustomFieldSectionComponent)
      end
    end

    context "with a section containing only admin_only fields" do
      let!(:section) { create(:user_custom_field_section) }
      let!(:field)   { create(:user_custom_field, :string, user_custom_field_section: section, admin_only: true) }

      it "excludes the section for a non-admin user" do
        expect(subject).to be_empty
      end
    end

    context "with multiple sections" do
      let!(:section_a) { create(:user_custom_field_section, position: 1) }
      let!(:section_b) { create(:user_custom_field_section, position: 2) }
      let!(:field_a)   { create(:user_custom_field, :string, user_custom_field_section: section_a) }
      let!(:field_b)   { create(:user_custom_field, :string, user_custom_field_section: section_b) }

      it "returns sections in position order" do
        names = subject.map { |s| s.instance_variable_get(:@section) }
        expect(names).to eq([section_a, section_b])
      end
    end
  end
end
