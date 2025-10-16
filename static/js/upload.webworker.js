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

function uploadChunk (chunk) {
    var xhr = new XMLHttpRequest();

    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
            if (xhr.status != 200) {
                self.postMessage({action:"FAIL", fileID:self.currentFileID});
                return false;
            }

            self.chunksSent++;

            var replyChunkIndex = parseInt(JSON.parse(xhr.responseText).chunk);
            self.chunkList[replyChunkIndex] = 3;
            var allDone = true;

            // iterate through chunkList and check if all values are
            // set to 3 (=done).
            for (var i in self.chunkList) {
                if (self.chunkList[i] != 3) { allDone = false; break; }
            }

            // if we sent and got ACK on all chunks we should tell the server that
            // all chunks are sent.
            if (allDone) {
                var xhrMerge = new XMLHttpRequest();
                xhrMerge.open("POST", "/merge?name=" + self.fileName + "&chunkCount=" + self.chunkCount + "&uuid=" + self.uuid + "&collectionID=" + self.collectionID);
                xhrMerge.onreadystatechange = function (e) {
                    if (xhrMerge.readyState == 4) {
                        if (xhrMerge.status != 200) {
                            self.postMessage({action:"FAIL", fileID:self.currentFileID});
                        } else {
                            // report back that upload of file was successful!
                            self.postMessage({action:"SUCCESS", fileID:self.currentFileID, fileName:JSON.parse(xhrMerge.responseText).fileName});
                        }
                    }
                };

                xhrMerge.send();
            }
        }
    };

    xhr.upload.onprogress = function(e) {
        self.postMessage({
            action:"PROGRESS",
            fileID:self.currentFileID,
            sent:(parseFloat(self.chunksSent+1)/self.chunkCount)}
        );
    };

    xhr.open("POST", "/upload?chunkIndex=" + self.chunkIndex + "&uuid=" + self.uuid);
    self.chunkList[self.chunkIndex] = 2;
    xhr.send(chunk);
}

self.onmessage = function(e, buf) {
    var BYTES_PER_CHUNK = 1024 * 1024 * 4;

    var blob = e.data.file,
        start = 0;

    self.chunksSent = 0;
    self.chunkIndex = 0;
    self.chunkCount = Math.ceil(blob.size / BYTES_PER_CHUNK);
    self.fileName = blob.name;
    self.collectionID = e.data.collectionID;
    self.uuid = guid();
    self.currentFileID = e.data.fileID;
    self.chunkList = Array(self.chunkCount);

    for (i=0; i++; i<self.chunkCount) { self.chunkList[i] = 0; }

    while (start < blob.size) {
        end = start + BYTES_PER_CHUNK;
        if (end > blob.size) end = blob.size;

        var chunk = blob.slice(start, end);
        self.chunkList[chunkIndex] = 1;
        uploadChunk(chunk);

        start = end;
        self.chunkIndex++;
    }
};
