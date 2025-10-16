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

var keyStr = "ABCDEFGHIJKLMNOP" +
             "QRSTUVWXYZabcdef" +
             "ghijklmnopqrstuv" +
             "wxyz0123456789+/" +
             "=";

function encode64 (input) {
    input = escape(input);
    var output = "";
    var chr1, chr2, chr3 = "";
    var enc1, enc2, enc3, enc4 = "";
    var i = 0;

    do {
        chr1 = input.charCodeAt(i++);
        chr2 = input.charCodeAt(i++);
        chr3 = input.charCodeAt(i++);

        enc1 = chr1 >> 2;
        enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        enc4 = chr3 & 63;

        if (isNaN(chr2)) {
           enc3 = enc4 = 64;
        } else if (isNaN(chr3)) {
           enc4 = 64;
        }

        output = output +
           keyStr.charAt(enc1) +
           keyStr.charAt(enc2) +
           keyStr.charAt(enc3) +
           keyStr.charAt(enc4);
        chr1 = chr2 = chr3 = "";
        enc1 = enc2 = enc3 = enc4 = "";
    } while (i < input.length);

    return output;
}

function uploadChunk (chunk, chunkIndex) {
    var xhr = new XMLHttpRequest();

    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
            if (xhr.status != 200) {
                console.error("Chunk upload failed with status:", xhr.status, "for chunk", chunkIndex);
                self.postMessage({action:"FAIL", fileID:self.currentFileID});
                return false;
            }

            self.chunksSent++;

            try {
                var replyChunkIndex = parseInt(JSON.parse(xhr.responseText).chunk);
                self.chunkList[replyChunkIndex] = 3;
            } catch (e) {
                console.error("Failed to parse chunk response:", e, "for chunk", chunkIndex);
                self.postMessage({action:"FAIL", fileID:self.currentFileID});
                return false;
            }

            // Upload next chunk sequentially
            uploadNextChunk();
        }
    };

    xhr.upload.onprogress = function(e) {
        self.postMessage({
            action:"PROGRESS",
            fileID:self.currentFileID,
            sent:(parseFloat(self.chunksSent)/self.chunkCount)}
        );
    };

    xhr.onerror = function() {
        console.error("Network error during chunk upload for chunk", chunkIndex);
        self.postMessage({action:"FAIL", fileID:self.currentFileID});
    };

    xhr.ontimeout = function() {
        console.error("Timeout during chunk upload for chunk", chunkIndex);
        self.postMessage({action:"FAIL", fileID:self.currentFileID});
    };

    xhr.open("POST", "/upload?chunkIndex=" + chunkIndex + "&uuid=" + self.uuid);
    xhr.timeout = 300000; // 5 minute timeout per chunk
    self.chunkList[chunkIndex] = 2;
    xhr.send(chunk);
}

function uploadNextChunk() {
    // Check if all chunks are done
    var allDone = true;
    var pendingCount = 0;
    for (var i = 0; i < self.chunkList.length; i++) {
        if (self.chunkList[i] != 3) {
            allDone = false;
            if (self.chunkList[i] === 0) {
                pendingCount++;
            }
        }
    }

    if (allDone) {
        // All chunks uploaded - trigger merge
        console.log("All chunks uploaded, triggering merge for", self.fileName);
        var xhrMerge = new XMLHttpRequest();
        xhrMerge.open("POST", "/merge?name=" + self.fileName + "&chunkCount=" + self.chunkCount + "&uuid=" + self.uuid + "&collectionID=" + self.collectionID);
        xhrMerge.onreadystatechange = function (e) {
            if (xhrMerge.readyState == 4) {
                if (xhrMerge.status != 200) {
                    console.error("Merge failed with status:", xhrMerge.status);
                    self.postMessage({action:"FAIL", fileID:self.currentFileID});
                } else {
                    // report back that upload of file was successful!
                    try {
                        var response = JSON.parse(xhrMerge.responseText);
                        self.postMessage({action:"SUCCESS", fileID:self.currentFileID, fileName:response.fileName});
                    } catch (e) {
                        console.error("Failed to parse merge response:", e);
                        self.postMessage({action:"FAIL", fileID:self.currentFileID});
                    }
                }
            }
        };

        xhrMerge.onerror = function() {
            console.error("Network error during merge");
            self.postMessage({action:"FAIL", fileID:self.currentFileID});
        };

        xhrMerge.ontimeout = function() {
            console.error("Timeout during merge");
            self.postMessage({action:"FAIL", fileID:self.currentFileID});
        };

        xhrMerge.timeout = 60000; // 1 minute timeout for merge
        xhrMerge.send();
        return;
    }

    // Find next chunk to upload (status 0 = not started)
    for (var i = 0; i < self.chunkList.length; i++) {
        if (self.chunkList[i] === 0) {
            var start = i * self.BYTES_PER_CHUNK;
            var end = Math.min(start + self.BYTES_PER_CHUNK, self.blob.size);
            var chunk = self.blob.slice(start, end);
            uploadChunk(chunk, i);
            return;
        }
    }

    // Edge case: No chunks with status 0, but not all done (chunks in status 2)
    // This means a chunk is currently uploading, so we wait
    if (!allDone && pendingCount === 0) {
        console.log("Waiting for chunk in progress...");
    }
}

self.onmessage = function(e) {
    self.BYTES_PER_CHUNK = 1024 * 1024 * 4;
    self.blob = e.data.file;

    self.chunksSent = 0;
    self.chunkCount = Math.ceil(self.blob.size / self.BYTES_PER_CHUNK);
    self.fileName = self.blob.name;
    self.collectionID = e.data.collectionID;
    self.uuid = guid();
    self.currentFileID = e.data.fileID;
    self.chunkList = Array(self.chunkCount);

    // Initialize all chunks to 0 (not started)
    for (var i = 0; i < self.chunkCount; i++) {
        self.chunkList[i] = 0;
    }

    // Start uploading the first chunk
    uploadNextChunk();
};
