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

RSpec.describe UserCustomFieldSection do
  describe ".with_custom_fields" do
    let!(:section_a) { create(:user_custom_field_section, name: "Section A", position: 1) }
    let!(:section_b) { create(:user_custom_field_section, name: "Section B", position: 2) }
    let!(:field_a1) { create(:user_custom_field, name: "A1", user_custom_field_section: section_a, position_in_custom_field_section: 1) }
    let!(:field_a2) { create(:user_custom_field, name: "A2", user_custom_field_section: section_a, position_in_custom_field_section: 2) }
    let!(:field_b1) { create(:user_custom_field, name: "B1", user_custom_field_section: section_b, position_in_custom_field_section: 1) }

    it "returns only sections that have at least one matching field" do
      result = described_class.with_custom_fields([field_a1.id])
      expect(result).to contain_exactly(section_a)
    end

    it "excludes sections with no matching fields" do
      result = described_class.with_custom_fields([field_a1.id])
      expect(result).not_to include(section_b)
    end

    it "orders sections by position" do
      result = described_class.with_custom_fields([field_a1.id, field_b1.id])
      expect(result).to eq([section_a, section_b])
    end

    it "loads the matching custom fields on each section" do
      result = described_class.with_custom_fields([field_a1.id, field_a2.id])
      expect(result.first.custom_fields).to contain_exactly(field_a1, field_a2)
    end

    it "orders fields within a section by position_in_custom_field_section" do
      result = described_class.with_custom_fields([field_a1.id, field_a2.id])
      expect(result.first.custom_fields).to eq([field_a1, field_a2])
    end
  end

  describe "#untitled?" do
    it { expect(described_class.new(name: nil)).to be_untitled }
    it { expect(described_class.new(name: "")).to be_untitled }
    it { expect(described_class.new(name: "My section")).not_to be_untitled }
  end
end
