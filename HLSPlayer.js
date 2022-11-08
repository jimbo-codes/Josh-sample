import ControlPanel, { Modes } from './ControlPanel';
import { useRef, useEffect, useState } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
import Hls from 'hls.js';
import {useGameStore} from '../store';
// import styles from './Player.scss'

export default function HLSPlayer({url, hideUI}) {
    const videoEl = useRef(null);
    const player = useRef();
    const [requiresPlayButton, setRequiresPlayButton] = useState(false);
    const [requiresUnmuteButton, setRequiresUnmuteButton] = useState(false);  
    const isIdle = useRef(false);
    const getQuestionLive = useGameStore((state) => state.questionStarted);
    const getStream = useGameStore((state) => state.gameStream)

    const [reconnecting, setReconnecting] = useState(false);

    // Hideui is currently unused (always false). if you delete also del control panel.
    // Flipping the video being shown or not
    // console.log(getQuestionLive)
    
    
    // Reset and schedule stream -- if the stream STOPS (you need to be trying to restart it)
    // if internet drops momentarily, the stream needs to be able to continue
// console.log(player.current)
// console.log(videoEl.current)
    useEffect(() => {
      if(getQuestionLive){
        document.getElementById('playerel').classList.add('invisible')
      }else if (!getQuestionLive){
        document.getElementById('playerel').classList.remove('invisible')
      }
    },[getQuestionLive,videoEl.current,player.current])
    
    const HLS_CONFIG = {
      manifestLoadingTimeOut: 5000,
      manifestLoadingMaxRetry: 500,
      manifestLoadingRetryDelay: 2000,
      manifestLoadingMaxRetryTimeout: 10000,
      fragLoadingTimeOut: 3000,
      fragLoadingMaxRetry: 6, // changed this from 6.
      fragLoadingRetryDelay: 500,
      fragLoadingMaxRetryTimeout: 3000,
      // liveSyncDurationCount: 3, // this too.
      // liveMaxLatencyDurationCount: 10, // these are tests
    };

    // console.log(videoEl.current)
    // MONOLITHIC VIDEO INSTANTIALIZATION FUNCTION
    useEffect(() => {
      console.log('Primary stream setup initialized')
      if (!videoEl.current) return; // if no video element break out
      let timer = undefined;
  
      const resetAndScheduleRecovery = () => {
        setReconnecting(true)
        resetPlayer(); // function to reset + destroy 
  
        if (isIdle.current) {
          // if the user is currently idle, then set an interval
          // while we wait for them to come back
          timer = window.setInterval(() => {
            if (!isIdle.current) {
              initializePlayer();
            }
          }, 1000);
        } else {
          // otherwise, schedule a recovery attempt
          timer = window.setTimeout(initializePlayer, 2000);
        }
      };
  
      const onVolumeChanged = () => {
        // setIsMuted(videoEl.current.muted); // currently this means that video starts with no audio.
        if (!videoEl.current.muted && hideUI !== 'true') {
          setRequiresUnmuteButton(false);
        }
      };
  
      const resetPlayer = () => {
        window.clearTimeout(timer);
        // console.log(videoEl.current.src)
        console.log('Attempting to Reset...')

        // This below line may prevent the stream from resetting on desktop

        // YOU COMMENTED THIS BELOW ONE BACK IN, SEE IF IT BREAKS THINGS.
        if (!videoEl.current) return; // if no stream - break out. // SEE IF THIS BREAKS THINGS
          videoEl.current.pause();
          videoEl.current.removeEventListener('volumechange', onVolumeChanged);
          // console.log(player.current)
        player.current && player.current.destroy();
      };

      const attemptPlay = () => { // if we stop the video and re-start it?
        if (!videoEl.current) return;
        const promise = videoEl.current.play();
        promise && promise.then(() => {
          // volume change events aren't reported before playback begins, so
          // make sure we're in sync now that playback has begun
          onVolumeChanged();
          // if we had to autoplay in a muted state, then show the big unmute button
          if (videoEl.current.muted && hideUI !== 'true') {
            setRequiresUnmuteButton(true);
            // the requires unmute button we need to create properly. (big unmute for user to hit.)
          }
        }, () => {
          if (!videoEl.current.muted) {
            // if autoplay failed while unmuted, then mute and try again
            videoEl.current.muted = true;
            attemptPlay();
          } else {
            // if autoplay failed while muted, then present a play button
            setRequiresPlayButton(true);
          }
        });
      };
  
      const initializePlayer = () => {
        const hls = player.current = new Hls(HLS_CONFIG);
        hls.attachMedia(videoEl.current);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(getStream));
  
        const onLevelLoaded = (event, data) => {
          console.log(data)
          if (!data.details) return;
          if (data.details.live) { // if loaded stream is live, then play the video.
            hls.off(Hls.Events.LEVEL_LOADED, onLevelLoaded);
            setReconnecting(false)
            attemptPlay();
          } else { // otherwise reset + try to recover stream.
            resetAndScheduleRecovery();
          }
        };
  
        videoEl.current.addEventListener('volumechange', onVolumeChanged);
        
        // Added this to attempt fixing stream issues. if video "ends" then reset + recover.
        videoEl.current.addEventListener('ended', (e) =>  // listens to see if the video is over, and tries to re-init.
        {
          // display a "reconnecting... component thing"
          console.log('The video event has ended (seeing fininte duration)')
          // set "error" state --> this can display the ""
        resetAndScheduleRecovery()
        }
        ) // looks out for if the livestream shows "ended". if it has, then try to re-initiate.

        hls.on(Hls.Events.LEVEL_LOADED, onLevelLoaded);
        hls.on(Hls.Events.ERROR, (event, data) => {
          
          if(data.fatal){ // testing to see if/when fatal's occur.
            console.log('fatal error')
          }
          console.log(data.details)
          console.log(Hls.ErrorDetails)
          console.log(data)

          // in safari, if unmuted autoplay fails, but muted autoplay recovery succeeds,
          // this error is still reported, breaking the otherwise successful recovery attempt.
          // if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) return;
          // Commented out above as it was causing errors on stalled replays..
  
          resetAndScheduleRecovery()
        });
      };
  
      initializePlayer();
      return resetPlayer;
    }, [getStream]);


    // Funciton for when video is played.
    const onPressPlay = () => {
      videoEl.current.muted = false;
      // attempt to find the live edge again before resuming
      const duration = videoEl.current.duration;
      // note: this condition is expected to only fail during development when
      // display is forced at nonsensical times
      if (duration < Infinity) {
        videoEl.current.currentTime = duration - 3000;
      }
      videoEl.current.play();
      setRequiresPlayButton(false);
    };

    // SWAP BETWEEN MUTED:
    const toggleMute = () => {
      videoEl.current.muted = !videoEl.current.muted;
    };
    // Dismissing control panel
  const dismissControlPanel = () => {
    // we only allow dismissing the unmute dialog, so we'll just flip this flag
    // to avoid extra state tracking
    setRequiresUnmuteButton(false);
  };

  let controlPanelMode = Modes.HIDDEN;
  // if (requiresPlayButton) controlPanelMode = Modes.PLAY;
  // if (requiresUnmuteButton && isMuted) controlPanelMode = Modes.UNMUTE;

  if (hideUI === 'true')
    controlPanelMode = Modes.HIDDEN;
    // IF The UI is hidden 
    return(
        
      // TO DISPLAY QUESTIONS: Set the z-index of "player" to be -1
      <>
    <div className={'player relative'} id='playerel'>
    
    {reconnecting?
    <div className='text-red-500 m-auto text-center mt-64'> Attempting to reconnect...</div>:null}

      <video
        ref={videoEl} className={'z-0'} controls={false} autoPlay={false} muted={false}
        preload='metadata' />

      {videoEl.current?
      // if not hidden and the video element is there
        <>
        {/* If you can't autoplay then: */}
          {requiresPlayButton?
          <div className='blurdiv flex'>
          <button className='video-but z-10 m-auto'
          onClick={onPressPlay}>
          Unable to autoplay, click to play!
          </button>
          </div>
          :
          // if you CAN autoplay, but the video is currently muted:
          videoEl.current.muted ?
            <div className='blurdiv flex'>
            <button className='video-but z-10 m-auto'
            onClick={toggleMute}>
            Click to unmute!
            </button>
            </div>:null
          }
          
{/* You are currently not using this control panel like the Q does. Can deconstruct later. */}
          <div className='THEDIVIDER BETWEEN VID AND CP'></div>
        <ControlPanel
        mode={controlPanelMode}
        onPlay={onPressPlay}
        onUnmute={toggleMute}
        onDismiss={dismissControlPanel} />
        </>
        :null
      }
    </div>
    </>

    )
}