function Utils(errorOutputId) { // eslint-disable-line no-unused-vars
    let self = this;
    this.errorOutput = document.getElementById(errorOutputId);
    console.log("===init utils====");

    const OPENCV_URL = 'opencv.js';
    this.loadOpenCv = function(onloadCallback) {
        let script = document.createElement('script');
        script.setAttribute('async', '');
        script.setAttribute('type', 'text/javascript');
        script.addEventListener('load', async () => {
            if (cv.getBuildInformation)
            {
                console.log(cv.getBuildInformation());
                onloadCallback();
            }
            else
            {
                // WASM
                if (cv instanceof Promise) {
                    cv = await cv;
                    console.log(cv.getBuildInformation());
                    onloadCallback();
                } else {
                    cv['onRuntimeInitialized']=()=>{
                        console.log(cv.getBuildInformation());
                        onloadCallback();
                    }
                }
            }
        });
        script.addEventListener('error', () => {
            self.printError('Failed to load ' + OPENCV_URL);
        });
        script.src = OPENCV_URL;
        let node = document.getElementsByTagName('script')[0];
        node.parentNode.insertBefore(script, node);
    };

    this.createFileFromUrl = function(path, url, callback) {
        // console.log('==============');
        // console.log(path);
        // console.log(url);
        // console.log(callback);
        // console.log('==============');
        let request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';
        request.onload = function(ev) {
            if (request.readyState === 4) {
                if (request.status === 200) {
                    let data = new Uint8Array(request.response);
                    cv.FS_createDataFile('/', path, data, true, false, false);
                    callback();
                } else {
                    self.printError('Failed to load ' + url + ' status: ' + request.status);
                }
            }
        };
        request.send();
    };

    this.loadImageToCanvas = function(url, cavansId) {
        let canvas = document.getElementById(cavansId);
        let ctx = canvas.getContext('2d');
        let img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.fillStyle = 'red';
            // ctx.save();
            // ctx.beginPath();
            // ctx.arc(img.height/2, img.height/2, img.height/2, 0, Math.PI * 2, false);
            // ctx.clip(); //剪切路径
            // ctx.drawImage(img, 0, 0);
            // //恢复状态
            // ctx.restore();
            ctx.drawImage(img, 0, 0, img.width, img.height);
        };
        img.src = url;
    };

    this.executeCode = function(textAreaId) {
        try {
            this.clearError();
            let code = document.getElementById(textAreaId).value;
            eval(code);
        } catch (err) {
            this.printError(err);
        }
    };

    this.clearError = function() {
        this.errorOutput.innerHTML = '';
    };

    this.printError = function(err) {
        if (typeof err === 'undefined') {
            err = '';
        } else if (typeof err === 'number') {
            if (!isNaN(err)) {
                if (typeof cv !== 'undefined') {
                    err = 'Exception: ' + cv.exceptionFromPtr(err).msg;
                }
            }
        } else if (typeof err === 'string') {
            let ptr = Number(err.split(' ')[0]);
            if (!isNaN(ptr)) {
                if (typeof cv !== 'undefined') {
                    err = 'Exception: ' + cv.exceptionFromPtr(ptr).msg;
                }
            }
        } else if (err instanceof Error) {
            err = err.stack.replace(/\n/g, '<br>');
        }
        this.errorOutput.innerHTML = err;
    };

    this.loadCode = function(scriptId, textAreaId) {
        let scriptNode = document.getElementById(scriptId);
        let textArea = document.getElementById(textAreaId);
        if (scriptNode.type !== 'text/code-snippet') {
            throw Error('Unknown code snippet type');
        }
        textArea.value = scriptNode.text.replace(/^\n/, '');
    };

    this.loadOpenCVprocess = function() {
        // openCV运行主逻辑
        let video = document.getElementById('videoInput');
        let canvasOutput = document.getElementById('canvasOutput');
        let src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
        let dst = new cv.Mat(video.height, video.width, cv.CV_8UC4);
        let maskBg = new cv.Mat(video.height, video.width, cv.CV_8UC4);
        let addedPic = new cv.Mat(video.height, video.width, cv.CV_8UC4);
        let mask = new cv.Mat.zeros(video.height, video.width, cv.CV_8UC1);
        let gray = new cv.Mat();
        let cap = new cv.VideoCapture(video);
        let faces = new cv.RectVector();
        let classifier = new cv.CascadeClassifier();



        console.log("===============")
        console.log(video.width, video.height)
        console.log("===============")

        //截图次数限制
        let picture_count = 3;
        let count_sec = 3; //截图之间的间隔


        // load pre-trained classifiers
        classifier.load('haarcascade_frontalface_default.xml');

        const FPS = 30;
        function processVideo() {
            try {
                if (!streaming) {
                    // clean and stop.
                    src.delete();
                    dst.delete();
                    mask.delete();
                    maskBg.delete();
                    addedPic.delete();
                    gray.delete();
                    faces.delete();
                    classifier.delete();
                    return;
                }
                let begin = Date.now();
                // start processing.
                cap.read(src);
                // src.copyTo(dst);
                cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY, 0);
                // detect faces.
                classifier.detectMultiScale(gray, faces, 1.3, 3, 0);

                src.copyTo(maskBg);


                let center = new cv.Point(video.width * (1/2), video.height * (1/2));
                cv.circle(mask, center, video.height * (3/8), [255, 255, 255, 255], -1);

                cv.add(maskBg, addedPic, dst, mask, cv.CV_8UC4);

                // let rect = new cv.Rect((video.width - video.height)/2,0,video.height,video.height);
                // dst.roi(rect);


                // // 标准边框
                // let regularPoint1 = new cv.Point(video.width * (1/8), video.height * (1/8));
                // let regularPoint2 = new cv.Point(video.width * (7/8), video.height * (7/8));
                // cv.rectangle(dst, regularPoint1, regularPoint2, [0, 255, 0, 255]);



                // draw faces.
                for (let i = 0; i < faces.size(); ++i) {
                    let face = faces.get(i);

                    // //调试用
                    // let point1 = new cv.Point(face.x, face.y);
                    // let point2 = new cv.Point(face.x + face.width, face.y + face.height);
                    // cv.rectangle(dst, point1, point2, [255, 0, 0, 255]);

                    // 判断头像大小和位置是否符合要求
                    if(face.width <= video.width * (3/4) && face.width >= video.width * (1/4) && face.height <= video.height * (3/4) && face.height >= video.height * (1/4)) {
                        if(face.x <= video.width * (3/8) && face.x >= video.width * (1/8) && face.y <= video.height * (3/8) && face.y >= video.height * (1/8)) {
                            if(picture_count > 0) {
                                picture_count--;
                                setTimeout(function(){
                                    let fullQuality = canvasOutput.toDataURL('image/png', 1)
                                    console.log(fullQuality);
                                }, 100);
                                console.log('==========识别成功' + picture_count + '=============');
                            }
                        }
                    }

                }

                if(picture_count == 0) {
                    cv.circle(dst, center, video.height * (3/8) + 3, [0, 255, 0, 255], 6);
                }else{
                    cv.circle(dst, center, video.height * (3/8) + 3, [255, 0, 0, 255], 6);
                }

                cv.imshow('canvasOutput', dst);

                // schedule the next one.
                let delay = 1000/FPS - (Date.now() - begin);
                setTimeout(processVideo, delay);
            } catch (err) {
                utils.printError(err);
            }
        };

        // schedule the first one.
        setTimeout(processVideo, 0);
    };

    this.addFileInputHandler = function(fileInputId, canvasId) {
        let inputElement = document.getElementById(fileInputId);
        inputElement.addEventListener('change', (e) => {
            let files = e.target.files;
            if (files.length > 0) {
                let imgUrl = URL.createObjectURL(files[0]);
                self.loadImageToCanvas(imgUrl, canvasId);
            }
        }, false);
    };

    function onVideoCanPlay() {
        if (self.onCameraStartedCallback) {
            self.onCameraStartedCallback(self.stream, self.video);
        }
    };

    this.startCamera = function(resolution, callback, videoId) {
        const constraints = {
            'qvga': {width: {exact: 320}, height: {exact: 240}},
            'vga': {width: {exact: 640}, height: {exact: 480}}};
        let video = document.getElementById(videoId);
        if (!video) {
            video = document.createElement('video');
        }

        let videoConstraint = constraints[resolution];
        if (!videoConstraint) {
            videoConstraint = true;
        }

        navigator.mediaDevices.getUserMedia({video: videoConstraint, audio: false})
            .then(function(stream) {
                video.srcObject = stream;
                video.play();
                self.video = video;
                self.stream = stream;
                self.onCameraStartedCallback = callback;
                video.addEventListener('canplay', onVideoCanPlay, false);
            })
            .catch(function(err) {
                self.printError('Camera Error: ' + err.name + ' ' + err.message);
            });
    };

    this.stopCamera = function() {
        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
            this.video.removeEventListener('canplay', onVideoCanPlay);
        }
        if (this.stream) {
            this.stream.getVideoTracks()[0].stop();
        }
    };
};
