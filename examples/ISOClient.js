// Copyright 2014 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
(function(window, undefined) {
  function parseMvhd(version, flags, bfp) {
    var varSize = (version == 1) ? 64 : 32;
    try {
      bfp.addField('creation_time', varSize);
      bfp.addField('modificaton_time', varSize);
      bfp.addUInt('timescale', 32);
      bfp.addUInt('duration', varSize);
      bfp.addField('rate', 32);
      bfp.addField('volume', 16);
      bfp.skip(16); // reserved = 0
      bfp.skip(32, 2); // int(32)[2] reserved = 0
      bfp.addField('matrix', 32, 9);
      bfp.addField('pre_defined', 32, 6);
      bfp.addUInt('next_track_ID', 32);
    } catch (e) {
      console.log(e.message);
      return false;
    }
    return true;
  }

  function parseSampleFlags(bfp) {
    bfp.skip(4); // reserved = 0
    bfp.addUInt('is_leading', 2);
    bfp.addUInt('sample_depends_on', 2);
    bfp.addUInt('sample_is_depended_on', 2);
    bfp.addUInt('sample_has_redundancy', 2);
    bfp.addUInt('sample_padding_Value', 3);
    bfp.addUInt('sample_is_non_sync_sample', 1);
    bfp.addUInt('sample_degradation_priority', 16);
  }

  function parseTrex(version, flags, bfp) {
    try {
      bfp.addUInt('track_ID', 32);
      bfp.addUInt('default_sample_description_index', 32);
      bfp.addUInt('default_sample_duration', 32);
      bfp.addUInt('default_sample_size', 32);
      parseSampleFlags(bfp.createChildParser('default_sample_flags'));
    } catch (e) {
      console.log(e.message);
      return false;
    }
    return true;
  }

  function parseTkhd(version, flags, bfp) {
    var varSize = (version == 1) ? 64 : 32;
    try {
      bfp.addField('creation_time', varSize);
      bfp.addField('modificaton_time', varSize);
      bfp.addUInt('track_ID', 32);
      bfp.skip(32); // reserved = 0
      bfp.addUInt('duration', varSize);
      bfp.skip(32, 2); // int(32)[2] reserved = 0
      bfp.addUInt('layer', 16);
      bfp.addUInt('alternate_group', 16);
      bfp.addField('volume', 16);
      bfp.skip(16); // reserved = 0
      bfp.addField('matrix', 32, 9);
      bfp.addUInt('width', 32);
      bfp.addUInt('height', 32);
    } catch (e) {
      console.log(e.message);
      return false;
    }
    return true;
  }

  function parseMdhd(version, flags, bfp) {
    var varSize = (version == 1) ? 64 : 32;
    try {
      bfp.addField('creation_time', varSize);
      bfp.addField('modificaton_time', varSize);
      bfp.addUInt('timescale', 32);
      bfp.addUInt('duration', varSize);
      bfp.skip(1);
      bfp.addField('language', 5,3);
      bfp.addField('pre_defined', 16)
    } catch (e) {
      console.log(e.message);
      return false;
    }
    return true;
  }

  function ISOClient(url, doneCallback) {
    this.doneCallback_ = doneCallback;
    this.parser_ = new msetools.ISOBMFFParser(this);
    this.file_ = new msetools.RemoteFile(url);
    this.readSize_ = 256 * 1024;
    this.file_.read(this.readSize_, this.onReadDone_.bind(this));
    this.list_stack_ = [];
    this.fieldInfo_ = [];
    this.flag_info_ = {
      'tkhd': [
        ['Track_enabled', 0x1],
        ['Track_in_movie', 0x2],
        ['Track_in_preview', 0x4]
      ],
      'tfhd': [
        ['base-data-offset', 0x1],
        ['sample-description-index-present', 0x2],
        ['default-sample-duration-present', 0x8],
        ['default-sample-size-present', 0x10],
        ['default-sample-flags-present', 0x20],
        ['duration-is-empty', 0x10000],
        ['default-base-is-moof', 0x20000],
      ],
      'trun': [
        ['data-offset-present', 0x1],
        ['first-sample-flags-present', 0x4],
        ['sample-duration-present', 0x100],
        ['sample-size-present', 0x200],
        ['sample-flags-present', 0x400],
        ['sample-composition-time-offsets-present', 0x800]
      ]
    };
    this.full_box_info_ = {
      'mvhd': parseMvhd,
      'trex': parseTrex,
      'tkhd': parseTkhd,
      'mdhd': parseMdhd
    };
  };

  ISOClient.prototype.onReadDone_ = function(status, buf) {
    console.log("onReadDone_(" + status + ")");

    if (status == 'eof') {
      //$( "#element_tree ul").accordion();
      this.doneCallback_(this.fieldInfo_);
      return;
    }

    if (status != 'ok') {
      console.log('onReadDone_(' + status + ')');
      this.doneCallback_(null);
      return;
    }

    if (this.parser_.parse(buf).length > 0) {
      console.log('onReadDone_(' + status + ') : parser error');
      this.doneCallback_(null);
      return;
    }
    this.file_.read(this.readSize_, this.onReadDone_.bind(this));
  };

  ISOClient.prototype.onListStart = function(id, elementPosition,
                                             bodyPosition) {
    this.list_stack_.push({ id: id, start: elementPosition,
                            child_info: this.fieldInfo_ });
    this.fieldInfo_ = [];
    return msetools.ParserStatus.OK;
  };


  ISOClient.prototype.onListEnd = function(id, size) {
    var info = this.list_stack_.pop();
    if (info.id != id) {
      console.log("Unexpected list end for id '" + id + "'");
      return false;
    }

    var fieldInfo = new FieldInfo(info.id, info.start, info.start + size);
    for (var i = 0; i < this.fieldInfo_.length; ++i) {
      fieldInfo.addChildFieldInfo(this.fieldInfo_[i]);
    }

    // Restore old fieldInfo_ state.
    this.fieldInfo_ = info.child_info;
    this.fieldInfo_.push(fieldInfo);
    return true;
  };


  ISOClient.prototype.onBox = function(id, value, elementPosition,
                                       bodyPosition) {
    this.fieldInfo_.push(
      new FieldInfo(id, elementPosition, bodyPosition + value.length));

    return true;
  };

  ISOClient.prototype.onFullBox = function(id, version, flags, value,
                                           elementPosition, bodyPosition) {

    var info = new FieldInfo(id, elementPosition, bodyPosition + value.length);

    info.addChild('version', bodyPosition - 4, bodyPosition - 3);
    var flagsFieldInfo = new FieldInfo('flags', bodyPosition - 3, bodyPosition);

    var flag_info = this.flag_info_[id];
    if (flag_info) {
      for (var i = 0; i < flag_info.length; ++i) {
        var name = flag_info[i][0];
        var mask = flag_info[i][1];
        var position = bodyPosition - 3;
        if (mask < 0x010000)
          ++position;
        if (mask < 0x000100)
          ++position;

        if ((flags & mask) != 0) {
          flagsFieldInfo.addChild(name, position, position + 1);
        }
      }
    }
    info.addChildFieldInfo(flagsFieldInfo);

    var parser = this.full_box_info_[id];
    if (parser) {
      var bfp = new BoxFieldParser(bodyPosition, value, info);
      if (!parser(version, flags, bfp)) {
        console.log("Failed to parse '" + id + "'");
        return false;
      }
    }

    this.fieldInfo_.push(info);

    return true;
  };
  
  window["ISOClient"] = ISOClient;
})(window);
