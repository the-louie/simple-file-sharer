var debug = true;

(function ($, window) {

  "use strict";

  var document = window.document;

  $(document).ready(function () {

    var all_files = [],
      current_file_id = 0,
      locked = false,
      prev_count_files = 0,
      waiting = 0,
      max_file_size = 10485760,
      noopHandler,
      dropzone;

    noopHandler = function (evt) {
      evt.stopPropagation();
      evt.preventDefault();
    };

    function handleNewFiles(files) {
      var count = files.length;
      if (count > 0) {
        prev_count_files = all_files.length;
        if ($("#dropzoneLabel").length !== 0) { $("#dropzone").html(''); }

        for (var i = prev_count_files + waiting, j = 0;
            i < prev_count_files + files.length + waiting;
            i++, j++ ) {
          $("#dropzone").append(
            '<div class="file ' + i + '" style="position:relative">' +
              '<span class="progressbar"></span>' +
              '<div class="name">' + files[j].name + '</div>' +
              '<div class="progress">' +
                '<input style="width: 800px;" class="resulttextbox" id="result" type="text" value="Waiting..." disabled />' +
                '<input style="width:65px;" class="resultcopy" id="copy" type="button" value="..." DISABLED/>' +
                '<input style="width:35px;display:none" class="resultcopyall" id="copy" type="button" value="" />' +
              '</div>' +
            '</div>'
          );
        }
        document.getElementById("dropzone").scrollTop = document.getElementById("dropzone").scrollHeight;
        waiting += count;
        if (!locked) {
          waiting -= count;
          all_files.push.apply(all_files, files);
          handleNextFile();
        }
      }
    }

    function uploadFinish(fileName, current_file_id) {
        var url = String(window.location.href+'/d/'+fileName.replace(/^\.\//,'')).replace(/([^:])\/\//,'$1/');

        $(".file." + current_file_id).css('background-color', '#ADA');
        $(".file." + current_file_id + " .progress .resulttextbox").val(url);
        $(".file." + current_file_id + " .name").html("<a href='"+url+"'>"+ $(".file." + current_file_id + " .name").html() +"</a>");
        $(".file." + current_file_id + " .progress input").removeAttr('disabled');
        $(".file." + current_file_id + " .progress .resultcopy").val('copy')
        $(".file." + current_file_id + " .progress .resultcopy").removeAttr('disabled');
        $(".file." + current_file_id + " .progress .resultcopy").zclip({
          path:'/static/js/ZeroClipboard.swf',
          copy:function(){return url;},
          afterCopy: function(){
            $(".file." + current_file_id + " .progress .resultcopy").attr("disabled", "disabled");
            $(".file." + current_file_id + " .progress .resultcopy").val('copied')
            return true;
          }
        });

      return true;
    }


    // this code handles people who use the file selector
    // instead of dropping the files.
    $("input[type=file]").change(function(evt) {
      handleNewFiles(evt.target.files)
    });

    function drop(evt) {
      noopHandler(evt);
      handleNewFiles(evt.dataTransfer.files);
    };

    /*
    Improved version with chunked uploading for large files
    */
    function handleNextFile() {
      console.log("Handling file id:",current_file_id);

      if (current_file_id >= all_files.length) {
        locked = false;
      } else {
        if (!all_files[current_file_id].size || all_files[current_file_id].size <= 0) {
          locked = false;
          $(".file." + current_file_id + " .progressbar").css("display","none");
          $(".file." + current_file_id).css('background-color', '#DAA');
          $(".file." + current_file_id + " .progress .resulttextbox").val('Empty or invalid file.');
          current_file_id++;
          return false;
        }

        locked = true;
        var blob = all_files[current_file_id];
        var worker = new Worker("/static/js/upload.webworker.js");
        var msg = {file: blob, fileID: current_file_id}
        worker.postMessage(msg);
        worker.onmessage = function(e) {
          if (e.data.action == 'SUCCESS') {
            $(".file." + current_file_id + " .progressbar").css("display","none");
            uploadFinish(e.data.fileName, current_file_id);
            all_files[current_file_id] = 1;
            current_file_id++;
            handleNextFile();
           } else if (e.data.action == 'FAIL') {
            locked = false;
            $(".file." + current_file_id + " .progressbar").css("opacity","0.5");
            $(".file." + current_file_id + " .progressbar").css("background-color","#DDD");
            $(".file." + current_file_id).css('background-color', '#DAA');
            $(".file." + current_file_id + " .progress .resulttextbox").val('Upload failed.');
            all_files[current_file_id] = 1;
            current_file_id++;
            handleNextFile();
            return false;
          } else if (e.data.action == 'PROGRESS') {
            $(".file." + current_file_id + " .progressbar").width((100*e.data.sent) + "%");
          }
        };
      }
    }

    dropzone = document.getElementById("dropzone");
    dropzone.addEventListener("dragenter", noopHandler, false);
    dropzone.addEventListener("dragexit", noopHandler, false);
    dropzone.addEventListener("dragover", noopHandler, false);
    dropzone.addEventListener("drop", drop, false);
  });

}(jQuery, window));