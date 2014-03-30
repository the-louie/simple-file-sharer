var debug = true;



(function($, window) {

	"use strict";

	var document = window.document;

	$(document).ready(function() {

		var all_files = [],
		    current_file_id = 0,
		    locked = false,
		    prev_count_files = 0,
		    waiting = 0,
		    max_file_size = 10485760,
		    drop, dropzone, handleNextFile, handleReaderLoad, noopHandler;

		noopHandler = function(evt) {
			evt.stopPropagation();
			evt.preventDefault();
		};

		function handleNewFiles(files) {
			var count = files.length;
			if ( count > 0 ) {
				prev_count_files = all_files.length;
				if ( $("#dropzoneLabel").length !== 0 )
					$("#dropzone").html('');

				for (	var i = prev_count_files + waiting, j = 0;
						i < prev_count_files + files.length + waiting;
						i++, j++ ) {
					$("#dropzone").append(
						'<div class="file ' + i +
						'"><div class="name">' +
						files[j].name +
						'</div><div class="progress"><input style="width: 800px;" class="resulttextbox" id="result" type="text" value="Waiting..." disabled /><input style="width:65px;" class="resultcopy" id="copy" type="button" value=":(" /><input style="width:35px;display:none" class="resultcopyall" id="copy" type="button" value="" /></div></div>'
					);
				}
				waiting += count;
				if ( ! locked ) {
					waiting -= count;
					all_files.push.apply(all_files, files);
					handleNextFile();
				}
			}
		}

		function uploadFinish(data, textStatus, jqXHR, current_file_id) {
			if ( jqXHR.status == 200 ) {
				var dataJS = jQuery.parseJSON( data );
				var url = String(window.location.href+'/d/'+dataJS.fileName.replace(/^\.\//,'')).replace(/([^:])\/\//,'$1/');
				if(debug){console.log('File uploaded: ', data, url);}
				$(".file." + current_file_id + " .progress .resulttextbox").val(url);
				$(".file." + current_file_id + " .name").html("<a href='"+url+"'>"+ $(".file." + current_file_id + " .name").html() +"</a>");
				if ($(".file." + current_file_id + " .progress .resulttextbox")) { $(".file." + current_file_id + " .progress input").removeAttr('disabled'); }
				//$(".file." + current_file_id + " .progress .resultcopy").text(url)
				$(".file." + current_file_id + " .progress").val("File upload failed!");
				$(".file." + current_file_id + " .progress .resultcopy").val('copy')
				$(".file." + current_file_id + " .progress .resultcopy").zclip({
					path:'/static/js/ZeroClipboard.swf',
					copy:function(){return url;},
					afterCopy: function(){
						$(".file." + current_file_id + " .progress .resultcopy").attr("disabled", "disabled");
						$(".file." + current_file_id + " .progress .resultcopy").val('copied')
						return true;
					}
				});
				// $(".file." + current_file_id + " .progress .resultcopyall").val('all')
				// $(".file." + current_file_id + " .progress .resultcopyall").zclip({
				// 	path:'/static/js/ZeroClipboard.swf',
				// 	copy:function(){return uuid;}
				// });
			}
			return true;
		}


		$("input[type=file]").change(function(event) {
			$.each(event.target.files, function(index, file) {
				var reader = new FileReader();
				reader.onload = function(event) {
					handleNewFiles([file]);
				};
				reader.readAsDataURL(file);
			});
		});

		function drop(evt) {
			noopHandler(evt);
			handleNewFiles(evt.dataTransfer.files);
		};

		function handleReaderLoad(evt) {

			var current_file = {};

			current_file.name = all_files[current_file_id].name;
			current_file.type = all_files[current_file_id].type;
			current_file.contents = evt.target.result;

			$.post('/upload', JSON.stringify(current_file), function(data,textStatus,jqXHR) {
				uploadFinish(data, textStatus, jqXHR, current_file_id);
				all_files[current_file_id] = 1;
				current_file_id++;
				handleNextFile();
			});
		};

		function handleNextFile() {
			if(debug) { console.log("Handling file id:",current_file_id); }

			if ( current_file_id < all_files.length ) {
				locked = true;

				if (all_files[current_file_id].size > max_file_size) {
					if(debug){console.log('filet too large: ',all_files[current_file_id].size);}
					$(".file." + current_file_id + " .progress .resulttextbox").val('File too large ('+(all_files[current_file_id].size / (1024*1024)).toFixed(0)+' MB), max size '+(max_file_size/ (1024*1024)).toFixed(0)+' MB');

					locked = false;
					all_files[current_file_id] = 1;
					current_file_id++;
					handleNextFile();
					return false;
				}
				if(debug){console.log("handling file: ",all_files[current_file_id]);}

				$(".file." + current_file_id + " .progress .resulttextbox").val('Uploading...');

				var current_file = all_files[current_file_id],
					reader = new FileReader();

				reader.onload = handleReaderLoad;
				reader.readAsDataURL(current_file);

			} else {
				locked = false;
			}
		};

		dropzone = document.getElementById("dropzone");
		dropzone.addEventListener("dragenter", noopHandler, false);
		dropzone.addEventListener("dragexit", noopHandler, false);
		dropzone.addEventListener("dragover", noopHandler, false);
		dropzone.addEventListener("drop", drop, false);
	});
	// $('input.resultcopy').click(function(){
	// 	alert('hej');
	// })
	// $('input.resultcopy').zclip({
	// 	path:'js/ZeroClipboard.swf',
	// 	copy:function(){alert($('input.resultcopy').text()); return $('input.resultcopy').text();}
	// });

}(jQuery, window));