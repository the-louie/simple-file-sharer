var debug = true;

var guid = (function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return function () {
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    };
})();

function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });
    return vars;
}

function humanFileSize(bytes, si) {
    var thresh = si ? 1000 : 1024;
    if(bytes < thresh) return bytes + ' B';
    var units = si ? ['kB','MB','GB','TB','PB','EB','ZB','YB'] : ['KiB','MiB','GiB','TiB','PiB','EiB','ZiB','YiB'];
    var u = -1;
    do {
        bytes /= thresh;
        ++u;
    } while(bytes >= thresh);
    return bytes.toFixed(1)+' '+units[u];
}

(function ($, window) {
    //"use strict";

    var document = window.document;

    $(document).ready(function () {

    var zclipCopy = function(url) { return url; };
    var zclipAfterCopy = function(currentFileID) {
        $(".file." + currentFileID + " .progress .resultcopy").attr("disabled", "disabled");
        $(".file." + currentFileID + " .progress .resultcopy").val('copied');
        return true;
    };

    var allFiles = [],
        currentFileID = 0,
        locked = false,
        prevCountFiles = 0,
        waiting = 0,
        uuid = guid(),
        uuidurl = String(window.location.origin+'/?c='+uuid),
        dropzone;

    var noopHandler = function (evt) {
        evt.stopPropagation();
        evt.preventDefault();
    };

    function handleNewFiles(files) {
        var count = files.length;
        if (count > 0) {
            prevCountFiles = allFiles.length;
            //if ($("#dropzoneLabel").length !== 0) { $("#dropzone").html(''); }

            for (var i = prevCountFiles + waiting, j = 0;
                i < prevCountFiles + files.length + waiting;
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
                allFiles.push.apply(allFiles, files);
                handleNextFile();
            }
        }
    }

    // change the apperance of the bar when the file upload is successful
    function uploadFinish(fileName, currentFileID) {
        //var url = String(window.location.href+'/d/'+fileName.replace(/^\.\//,'')).replace(/([^:])\/\//,'$1/');
        var url = String(window.location.origin+'/d/'+fileName);

        $(".file." + currentFileID).css('background-color', '#ADA');
        $(".file." + currentFileID + " .progress .resulttextbox").val(url);
        $(".file." + currentFileID + " .name").html("<a href='"+url+"'>"+ $(".file." + currentFileID + " .name").html() +"</a>");
        $(".file." + currentFileID + " .progress input").removeAttr('disabled');
        $(".file." + currentFileID + " .progress .resultcopy").val('copy');
        $(".file." + currentFileID + " .progress .resultcopy").removeAttr('disabled');
        $(".file." + currentFileID + " .progress .resultcopy").zclip({
            path:'/js/ZeroClipboard.swf',
                copy: zclipCopy(url),
                afterCopy: zclipAfterCopy(currentFileID),
            });

      return true;
    }


    // this code handles people who use the file selector
    // instead of dropping the files.
    $("input[type=file]").change(function(evt) {
        handleNewFiles(evt.target.files);
    });

    // this code handles people who drop the files instead
    // or using the button
    function drop(evt) {
        noopHandler(evt);
        handleNewFiles(evt.dataTransfer.files);
    }

    /*
    Improved version with chunked uploading for large files
    */
    function handleNextFile() {
        if (currentFileID >= allFiles.length) {
            locked = false;
        } else {
            if (!allFiles[currentFileID].size || allFiles[currentFileID].size <= 0) {
              locked = false;
              $(".file." + currentFileID + " .progressbar").css("display","none");
              $(".file." + currentFileID).css('background-color', '#DAA');
              $(".file." + currentFileID + " .progress .resulttextbox").val('Empty or invalid file.');
              currentFileID++;
              return false;
            }

            locked = true;
            var blob = allFiles[currentFileID];
            var worker = new Worker("/js/upload.webworker.js");
            var msg = {file: blob, fileID: currentFileID, collectionID: uuid};
            worker.postMessage(msg);
            $("#dropzoneLabel").css('display','none');
            worker.onmessage = function(e) {
                if (e.data.action == 'SUCCESS') {
                    if(allFiles.length > 1) $(".collection").css("display", "block");
                    $(".file." + currentFileID + " .progressbar").css("display","none");
                    uploadFinish(e.data.fileName, currentFileID);
                    allFiles[currentFileID] = 1;
                    currentFileID++;
                    handleNextFile();
                } else if (e.data.action == 'FAIL') {
                    locked = false;
                    $(".file." + currentFileID + " .progressbar").css("opacity","0.5");
                    $(".file." + currentFileID + " .progressbar").css("background-color","#DDD");
                    $(".file." + currentFileID).css('background-color', '#DAA');
                    $(".file." + currentFileID + " .progress .resulttextbox").val('Upload failed.');
                    allFiles[currentFileID] = 1;
                    currentFileID++;
                    handleNextFile();
                    return false;
                } else if (e.data.action == 'PROGRESS') {
                    $(".file." + currentFileID + " .progressbar").width((100*e.data.sent) + "%");
                }
            };
        }
    }


    if (getUrlVars().c) {
        $("#dropzoneLabel").css('display','none');
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET","/c/"+getUrlVars().c,true);
        xmlhttp.onreadystatechange=function() {
            if (xmlhttp.readyState==4 && xmlhttp.status==200) {
                var responses = JSON.parse(xmlhttp.responseText);

                for (var r in responses) {
                    var response = responses[r];
                    var url = String(window.location.origin+'/d/'+response.sha);
                    $("#dropzone").append(
                        '<div class="file ' + r + '" style="position:relative">' +
                            '<span class="progressbar"></span>' +
                            '<div class="name"><a href="' + url + '">' + response.fileName + '</a> (' + humanFileSize(response.fileSize, false) + ')</div>' +
                            '<div class="progress">' +
                                '<input style="width: 800px;" class="resulttextbox" id="result" type="text" value="'+url+'" disabled />' +
                                '<input style="width:65px;" class="resultcopy" id="copy" type="button" value="copy"/>' +
                                '<input style="width:35px;display:none" class="resultcopyall" id="copy" type="button" value="" />' +
                            '</div>' +
                        '</div>'
                    );

                    $(".file." + r + " .progress .resultcopy").zclip(function(r, url) {
                        return {
                            path:'/js/ZeroClipboard.swf',
                            copy: zclipCopy(url),
                            afterCopy: zclipAfterCopy(currentFileID),
                        };
                    }(r, url));
                }
            }
        };
    xmlhttp.send();

    } else {
        dropzone = document.getElementById("dropzone");
        dropzone.addEventListener("dragenter", noopHandler, false);
        dropzone.addEventListener("dragexit", noopHandler, false);
        dropzone.addEventListener("dragover", noopHandler, false);
        dropzone.addEventListener("drop", drop, false);
    }

    $("#dropzone").append(
        '<div class="collection" style="position:relative;display: none;">' +
            '<div class="name"><a href="'+uuidurl+'">Collection URL</a></div>' +
            '<input style="width: 800px;" class="resulttextbox" id="result" type="text" value="'+uuidurl+'" />' +
            '<input style="width:65px;" class="resultcopy" id="copy" type="button" value="copy"/>' +
            '<input style="width:35px;display:none" class="resultcopyall" id="copy" type="button" value="" />' +
        '</div>'
    );
    $(".file.collection.resultcopy").zclip({
        path: '/js/ZeroClipboard.swf',
        copy:function(){return uuidurl;},
        afterCopy: function(){
            $(".file." + currentFileID + " .progress .resultcopy").val('copied');
            return true;
        }
    });

  });

}(jQuery, window));