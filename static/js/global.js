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

function relativeTime(unixTimestamp) {
    var now = Math.floor(Date.now() / 1000);
    var diff = now - unixTimestamp;

    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' minutes ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' hours ago';
    if (diff < 604800) return Math.floor(diff / 86400) + ' days ago';
    if (diff < 2592000) return Math.floor(diff / 604800) + ' weeks ago';
    return Math.floor(diff / 2592000) + ' months ago';
}

(function ($, window) {
    //"use strict";

    var document = window.document;

    $(document).ready(function () {

    // Modern clipboard API function
    var copyToClipboard = function(text, buttonElement) {
        console.log('Attempting to copy:', text);
        console.log('Secure context:', window.isSecureContext);
        console.log('Clipboard API available:', !!navigator.clipboard);

        if (navigator.clipboard && window.isSecureContext) {
            console.log('Using modern Clipboard API');
            // Use modern Clipboard API
            navigator.clipboard.writeText(text).then(function() {
                console.log('Clipboard API copy successful');
                buttonElement.val('copied');
                buttonElement.prop('disabled', true);
                setTimeout(function() {
                    buttonElement.val('copy');
                    buttonElement.prop('disabled', false);
                }, 2000);
            }).catch(function(err) {
                console.error('Clipboard API failed:', err);
                console.log('Falling back to execCommand method');
                fallbackCopyTextToClipboard(text, buttonElement);
            });
        } else {
            if (!window.isSecureContext) {
                console.warn('Not in secure context (HTTPS required for Clipboard API)');
            }
            if (!navigator.clipboard) {
                console.warn('Clipboard API not available');
            }
            console.log('Using fallback method');
            fallbackCopyTextToClipboard(text, buttonElement);
        }
    };

    // Fallback copy function for older browsers
    var fallbackCopyTextToClipboard = function(text, buttonElement) {
        console.log('Using fallback clipboard method');
        var textArea = document.createElement("textarea");
        textArea.value = text;

        // Make textarea visible but off-screen
        textArea.style.position = "absolute";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.style.width = "1px";
        textArea.style.height = "1px";
        textArea.style.opacity = "0";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        // Use setSelectionRange for better compatibility
        try {
            textArea.setSelectionRange(0, 99999);
        } catch (e) {
            console.log('setSelectionRange not supported, using select()');
        }

        try {
            var successful = document.execCommand('copy');
            console.log('Fallback copy result:', successful);
            if (successful) {
                buttonElement.val('copied');
                buttonElement.prop('disabled', true);
                setTimeout(function() {
                    buttonElement.val('copy');
                    buttonElement.prop('disabled', false);
                }, 2000);
            } else {
                console.error('Fallback: document.execCommand("copy") returned false');
                buttonElement.val('Copy failed');

                // Add toast notification
                var toast = $('<div class="copy-toast">Couldn\'t automatically copy the url, please copy manually</div>');
                toast.css({
                    'position': 'fixed',
                    'top': '20px',
                    'right': '20px',
                    'background': '#ffc107',
                    'color': '#000',
                    'padding': '10px 15px',
                    'border-radius': '4px',
                    'z-index': '9999',
                    'max-width': '300px',
                    'box-shadow': '0 2px 10px rgba(0,0,0,0.1)',
                    'font-family': 'Arial, sans-serif',
                    'font-size': '14px'
                });
                $('body').append(toast);

                // Make the textbox more prominent to guide user
                var textbox = buttonElement.siblings('.resulttextbox');
                textbox.css({
                    'background-color': '#fff3cd',
                    'border': '2px solid #ffc107',
                    'font-weight': 'bold'
                });

                setTimeout(function() {
                    buttonElement.val('copy');
                    textbox.css({
                        'background-color': '',
                        'border': '',
                        'font-weight': ''
                    });
                    toast.fadeOut(function() { toast.remove(); });
                }, 4000); // Longer timeout to give user time to see the instruction
            }
        } catch (err) {
            console.error('Fallback: document.execCommand("copy") failed:', err);
            buttonElement.val('Copy failed');

            // Add toast notification
            var toast = $('<div class="copy-toast">Couldn\'t automatically copy the url, please copy manually</div>');
            toast.css({
                'position': 'fixed',
                'top': '20px',
                'right': '20px',
                'background': '#ffc107',
                'color': '#000',
                'padding': '10px 15px',
                'border-radius': '4px',
                'z-index': '9999',
                'max-width': '300px',
                'box-shadow': '0 2px 10px rgba(0,0,0,0.1)',
                'font-family': 'Arial, sans-serif',
                'font-size': '14px'
            });
            $('body').append(toast);

            // Make the textbox more prominent to guide user
            var textbox = buttonElement.siblings('.resulttextbox');
            textbox.css({
                'background-color': '#fff3cd',
                'border': '2px solid #ffc107',
                'font-weight': 'bold'
            });

            setTimeout(function() {
                buttonElement.val('copy');
                textbox.css({
                    'background-color': '',
                    'border': '',
                    'font-weight': ''
                });
                toast.fadeOut(function() { toast.remove(); });
            }, 4000); // Longer timeout to give user time to see the instruction
        }

        document.body.removeChild(textArea);
    };

    var allFiles = [],
        currentFileID = 0,
        locked = false,
        prevCountFiles = 0,
        waiting = 0,
        uuid = guid(),
        uuidurl = String(window.location.origin+'/?c='+uuid),
        dropzone,
        uploadsInProgress = false;

    var noopHandler = function (evt) {
        evt.stopPropagation();
        evt.preventDefault();
    };

    // Add beforeunload warning for active uploads
    function setupUploadWarning() {
        window.addEventListener('beforeunload', function(e) {
            if (uploadsInProgress) {
                var message = 'You have uploads in progress. Are you sure you want to leave?';
                e.returnValue = message; // For Chrome
                return message; // For other browsers
            }
        });
    }

    // Initialize the upload warning
    setupUploadWarning();

    // Fetch and display quota information
    function loadQuotaInfo() {
        $.ajax({
            url: '/api/quota',
            method: 'GET',
            success: function(data) {
                if (data.enabled) {
                    var quotaText = '';
                    var isWarning = false;

                    if (data.perIP.bytesLimit) {
                        var used = humanFileSize(data.perIP.bytesUsed || 0, true);
                        var limit = humanFileSize(data.perIP.bytesLimit, true);
                        var percentUsed = ((data.perIP.bytesUsed || 0) / data.perIP.bytesLimit) * 100;
                        quotaText += 'Daily storage: <strong>' + used + ' / ' + limit + '</strong>';
                        if (percentUsed > 90) isWarning = true;
                    }

                    if (data.perIP.filesLimit) {
                        if (quotaText) quotaText += ' &nbsp;|&nbsp; ';
                        var filesUsed = data.perIP.filesUsed || 0;
                        var filesLimit = data.perIP.filesLimit;
                        var filesPercent = (filesUsed / filesLimit) * 100;
                        quotaText += 'Daily files: <strong>' + filesUsed + ' / ' + filesLimit + '</strong>';
                        if (filesPercent > 90) isWarning = true;
                    }

                    if (data.global.limit) {
                        if (quotaText) quotaText += ' &nbsp;|&nbsp; ';
                        var globalUsed = humanFileSize(data.global.used || 0, true);
                        var globalLimit = humanFileSize(data.global.limit, true);
                        quotaText += 'Server: <strong>' + globalUsed + ' / ' + globalLimit + '</strong>';
                    }

                    if (quotaText) {
                        var quotaHtml = quotaText;
                        if (isWarning) {
                            quotaHtml = '<span class="quota-warning">⚠ Approaching limit: </span>' + quotaText;
                        }
                        $('#quota-info').html(quotaHtml).show();
                    }
                }
            },
            error: function() {
                console.log('Failed to load quota info');
            }
        });
    }

    function handleNewFiles(files) {
        var count = files.length;
        if (count > 0) {
            prevCountFiles = allFiles.length;
            //if ($("#dropzoneLabel").length !== 0) { $("#dropzone").html(''); }

            // Remove additional upload section when new files are added
            $("#additional-upload-section").remove();

            for (var i = prevCountFiles + waiting, j = 0;
                i < prevCountFiles + files.length + waiting;
                i++, j++ ) {
                $("#dropzone").append(
                '<div class="file ' + i + '" style="position:relative">' +
                    '<span class="progressbar"></span>' +
                    '<div class="name ' + i + '"></div>' +
                    '<div class="progress">' +
                        '<input style="width: 800px;" class="resulttextbox" id="result" type="text" value="Waiting..." disabled />' +
                        '<input style="width:65px;" class="resultcopy" id="copy" type="button" value="..." DISABLED/>' +
                        '<input style="width:35px;display:none" class="resultcopyall" id="copy" type="button" value="" />' +
                    '</div>' +
                '</div>'
                );
                $(".name." + i).text(files[j].name);
            }
            document.getElementById("dropzone").scrollTop = document.getElementById("dropzone").scrollHeight;
            waiting += count;
            if (!locked) {
                waiting -= count;
                allFiles.push.apply(allFiles, files);
                uploadsInProgress = true; // Set flag when uploads start
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

        // Add click handler for modern clipboard API
        $(".file." + currentFileID + " .progress .resultcopy").off('click').on('click', function() {
            copyToClipboard(url, $(this));
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

    // Function to show additional upload option when all files are done
    function showAdditionalUploadOption() {
        // Check if the additional upload section already exists
        if ($("#additional-upload-section").length === 0) {
            var additionalSection = $(
                '<div id="additional-upload-section" style="' +
                'height: 144px; ' +
                'background-color: #f8f9fa; ' +
                'border: 2px dashed #bdb; ' +
                'border-radius: 8px; ' +
                'margin-top: 20px; ' +
                'display: flex; ' +
                'align-items: center; ' +
                'justify-content: center; ' +
                'text-align: center; ' +
                'color: #8c8; ' +
                'font-family: Arial, sans-serif; ' +
                'font-size: 0.9em; ' +
                'cursor: pointer;">' +
                '<div>' +
                'Want to upload more files?<br/>' +
                'Drop files here to add more' +
                '</div>' +
                '</div>'
            );
            $("#dropzone").append(additionalSection);

            // Make the additional section a drop zone using jQuery for consistency
            additionalSection.on("dragenter", noopHandler);
            additionalSection.on("dragexit", noopHandler);
            additionalSection.on("dragover", noopHandler);
            additionalSection.on("drop", function(evt) {
                noopHandler(evt);
                handleNewFiles(evt.originalEvent.dataTransfer.files);
            });
        }
    }

    /*
    Improved version with chunked uploading for large files
    */
    function handleNextFile() {
        if (currentFileID >= allFiles.length) {
            locked = false;
            uploadsInProgress = false; // Reset flag when all uploads complete
            // All files uploaded - show additional upload option
            showAdditionalUploadOption();
        } else {
            if (!allFiles[currentFileID].size || allFiles[currentFileID].size <= 0) {
              locked = false;
              $(".file." + currentFileID + " .progressbar").css("display","none");
              $(".file." + currentFileID).css('background-color', '#DAA');
              $(".file." + currentFileID + " .progress .resulttextbox").val('Empty or invalid file.');
              allFiles[currentFileID] = 1; // Mark as processed
              currentFileID++;
              handleNextFile(); // Continue to next file or completion
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
                    $(".file." + currentFileID + " .merging-status").remove(); // Clean up merging message
                    uploadFinish(e.data.fileName, currentFileID);
                    loadQuotaInfo(); // Update quota display after successful upload
                    allFiles[currentFileID] = 1;
                    currentFileID++;
                    handleNextFile();
                } else if (e.data.action == 'FAIL') {
                    locked = false;
                    $(".file." + currentFileID + " .progressbar").css("opacity","0.5");
                    $(".file." + currentFileID + " .progressbar").css("background-color","#DDD");
                    $(".file." + currentFileID).css('background-color', '#DAA');
                    $(".file." + currentFileID + " .merging-status").remove(); // Clean up merging message

                    // Display specific error message if available
                    var errorMessage = e.data.error || 'Upload failed.';
                    $(".file." + currentFileID + " .progress .resulttextbox").val(errorMessage);

                    allFiles[currentFileID] = 1;
                    currentFileID++;
                    handleNextFile();
                    return false;
                } else if (e.data.action == 'MERGING') {
                    // Show merge in progress
                    $(".file." + currentFileID + " .progressbar").width("100%");
                    $(".file." + currentFileID + " .progressbar").css("background-color","#9C9");
                    $(".file." + currentFileID).prepend('<div class="merging-status">Processing file...</div>');
                } else if (e.data.action == 'PROGRESS') {
                    $(".file." + currentFileID + " .progressbar").width((100*e.data.sent) + "%");
                }
            };
        }
    }


    if (getUrlVars().c) {
        $("#dropzoneLabel").css('display','none');
        uploadsInProgress = false; // Reset flag for collection view
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET","/c/"+getUrlVars().c,true);
        xmlhttp.onreadystatechange=function() {
            if (xmlhttp.readyState==4) {
                if (xmlhttp.status==200) {
                    try {
                        var responses = JSON.parse(xmlhttp.responseText);

                        for (var r in responses) {
                            var response = responses[r];
                            var url = String(window.location.origin+'/d/'+response.sha);
                            var fileInfo = humanFileSize(response.fileSize, false);
                            if (response.timestamp) {
                                fileInfo += ' • ' + relativeTime(response.timestamp);
                            }
                            $("#dropzone").append(
                        '<div class="file ' + r + '" style="position:relative">' +
                            '<span class="progressbar"></span>' +
                            '<div class="name"><a href="' + url + '">' + response.fileName + '</a> <span style="color:#999;">(' + fileInfo + ')</span></div>' +
                            '<div class="progress">' +
                                '<input style="width: 800px;" class="resulttextbox" id="result" type="text" value="'+url+'" disabled />' +
                                '<input style="width:65px;" class="resultcopy" id="copy" type="button" value="copy"/>' +
                                '<input style="width:35px;display:none" class="resultcopyall" id="copy" type="button" value="" />' +
                            '</div>' +
                        '</div>'
                    );

                    // Add click handler for modern clipboard API
                    // Use closure to capture the specific URL for this button
                    (function(specificUrl) {
                        $(".file." + r + " .progress .resultcopy").off('click').on('click', function() {
                            copyToClipboard(specificUrl, $(this));
                        });
                    })(url);
                }
                    } catch (e) {
                        console.error("Failed to parse collection response:", e);
                        $("#dropzone").html('<div style="color:#c85;padding:20px;">Failed to load collection. Please try again.</div>');
                    }
                } else {
                    // Handle error responses
                    console.error("Failed to load collection, status:", xmlhttp.status);
                    $("#dropzone").html('<div style="color:#c85;padding:20px;">Collection not found.</div>');
                }
            }
        };
    xmlhttp.send();

    } else {
        uploadsInProgress = false; // Reset flag for fresh page load
        dropzone = $(".dropdiv")[0];
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
    // Add click handler for collection URL copy
    $(".collection .resultcopy").off('click').on('click', function() {
        copyToClipboard(uuidurl, $(this));
    });

    // Load quota on page load (if not collection view)
    if (!getUrlVars().c) {
        loadQuotaInfo();
    }

  });

}(jQuery, window));
