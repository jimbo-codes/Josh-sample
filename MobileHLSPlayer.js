import React, { useState, useEffect, useRef } from 'react';
import { Modes } from './ControlPanel';
import {useGameStore} from '../store';

export default function MobileHLSPlayer({theme, hideUI, isBackgroundVideo = false,}) {
    const DEBUG = true;
    const LAG_MONITOR_INTERVAL = 1000;
    const MAX_LAG = 2000;
    const videoEl = useRef(null);
    const [isMuted, setIsMuted] = useState(false);
    // Change these bottom two to be same as in the HLS player.
    const [showUnmutePrompt, setShowUnmutePrompt] = useState(false);
    const [showPressPlayPrompt, setShowPressPlayPrompt] = useState(false);
    const getQuestionLive = useGameStore((state) => state.questionStarted);
    const getStream = useGameStore((state) => state.gameStream)
    // Flipping the video being shown or not
useEffect(() => {
  if(getQuestionLive){
    //   console.log(document.getElementById('playerel'))
      document.getElementById('playerel').classList.add('invisible')
    }else if (!getQuestionLive){
    //   console.log(document.getElementById('playerel'))
      document.getElementById('playerel').classList.remove('invisible')
    }
},[getQuestionLive])

    // Gargantuan instantialization of video player.
    useEffect(() => {
        const v = videoEl.current;
        if (!v) return; // bailout if no video.
        // only needed for bailing out of promise handlers, as we can't cancel them when
        // the player is destroyed
        let isDestroyed = false;
        let playAttemptInFlight = false;
        let playbackStarted = false;
        const timers = {};

        // event handlers
        const eventHandlers = {
          loadedmetadata: trace('e:loadedmetadata', () => {
            // note: this is a live-only player, so a playlist that includes an #EXT-X-ENDLIST tag
            // is either stale or indicating an upstream error. we can infer the presence of this tag
            // by looking for a finite `duration`
            if (!isBackgroundVideo && v.duration && v.duration < Infinity) {
              log('duration was finite; will schedule reinit');
              scheduleReinit();
            } else {
              attemptAutoPlay();
            }
          }),
          // note: this will also fire after stalls, but we only care about the first run
          // playing: trace('e:playing', () => (playbackStarted = true)),
          volumechange: trace('e:volumechange', () => {
            setIsMuted(v.muted);
            // this never needs to be shown after we've confirmed playback w/ audio at least once
            if (!v.muted && hideUI !== 'true') {
              setShowUnmutePrompt(false);
            }
          }),
          error: trace('e:error', () => scheduleReinit()),
          // note: the `playing` event also triggers during failed autoplay attempts, so
          // we look for a timeupdate event, instead
          timeupdate: trace('e:timeupdate', () => {
            if (v.currentTime > 0) {
              log('start of playback detected');
              playbackStarted = true;
              // no need to keep listening
              v.removeEventListener('timeupdate', eventHandlers.timeupdate);
            }
          })
        };
    
        // player operations
        const initPlayer = () => {
          log('initPlayer()');
          isDestroyed = false;
    
          // note: this mostly happens during recovery scenarios
          if (document.visibilityState && document.visibilityState !== 'visible') {
            log('document not visible; will wait');
            timers.initDelay = setTimeout(initPlayer, 1000);
            return;
          }
    
          let totalLag = 0;
          let prevSystemTime = -1;
          let prevPlayerTime = -1;

          // these timers may need to be analyzed if errors persist on mobile.
          timers.lagMonitor = setInterval(() => {
            if (!playbackStarted) return;
    
            if (prevSystemTime === -1) {
              prevSystemTime = Date.now();
              prevPlayerTime = v.currentTime * 1000;
            } else {
              const currentPlayerTime = v.currentTime * 1000;
              const currentSystemTime = Date.now();
    
              const elapsedSystemTime = currentSystemTime - prevSystemTime;
              const elapsedPlayerTime = currentPlayerTime - prevPlayerTime;
              const periodLag = elapsedSystemTime - elapsedPlayerTime;

              // note: it's possible for the player to drift incrementally either direction from clock
              // time, but here we are only interested in discrete lag events indiciative of player
              // stalls. we filter by discrepancies >5ms to smooth out noise from non-events
              if (periodLag >= 5) {
                log(`a ${periodLag}ms lag was detected during last ${LAG_MONITOR_INTERVAL}ms period`);
                totalLag+= periodLag;
              }
    
              if (totalLag > MAX_LAG) {
                log(`total lag time has reached ${totalLag}ms, exceeding limit of ${MAX_LAG}ms`);
                scheduleReinit();
              } else {
                prevSystemTime = currentSystemTime;
                prevPlayerTime = currentPlayerTime;
              }
            }
          }, LAG_MONITOR_INTERVAL);
    
          Object.keys(eventHandlers).forEach(evt => v.addEventListener(evt, eventHandlers[evt]));
          v.src = getStream;
        };
    
        const attemptAutoPlay = () => {
          log('attemptAutoPlay()');
          if (playAttemptInFlight === true) return;
    
          playAttemptInFlight = true;
          const promise = v.play();
          // this promise has a tendency to never resolve in iOS Safari
          // (and long delays have been observed in desktop Safari as well)
          promise && Promise.race([promise, timeout(3000)]).then(() => {
            log('autoplay promise fulfilled');
            playAttemptInFlight = false;
            eventHandlers.volumechange();
            // if autoplay began in a muted state, then prompt user to unmute
            v.muted && setShowUnmutePrompt(true);
          }, (err) => {
            if (isDestroyed) return;
    
            if (err.isTimeout) {
              log('autoplay promise timed out');
              scheduleReinit();
              return;
            }
    
            log('autoplay promise rejected');
            playAttemptInFlight = false;
            // if autoplay failed while unmuted, then mute and try again
            if (!v.muted) {
              log('player is unmuted; will attempt autoplay muted');
              v.muted = true;
              attemptAutoPlay();
            } else {
              if (isDestroyed) return;
    
              log('player is muted; will present play control');
              // if autoplay failed while muted, then prompt user to hit play
              setShowPressPlayPrompt(true);
            }
          });
        };
    
        const destroyPlayer = () => {
          log('destroyPlayer()');
          Object.values(timers).forEach(timer => clearTimeout(timer));
          Object.keys(eventHandlers).forEach(evt => v.removeEventListener(evt, eventHandlers[evt]));
          playAttemptInFlight = false;
          playbackStarted = false;
          isDestroyed = true;
          v.pause();
        };
    
        const scheduleReinit = () => {
          log('scheduleReinit()');
          clearTimeout(timers.reInit);
    
          destroyPlayer();
          timers.reInit = setTimeout(initPlayer, 2000);
        };
    
        initPlayer();
    
        return destroyPlayer;
    
      }, [getStream, hideUI]);

    //   End of HUGE initialization funct.


  const toggleMute = () => {
    videoEl.current.muted = !videoEl.current.muted;
    // idk if this makes it disappear or not?
  };

  const dismissControlPanel = () => { // we won't use this for now.
    setShowPressPlayPrompt(false);
    setShowUnmutePrompt(false);
  };

  const onPressPlay = () => {
    videoEl.current.muted = false;
    videoEl.current.play();
    setShowPressPlayPrompt(false);
      // Test the autoplaying thing.
    // dismissControlPanel();
  };


  let controlPanelMode = Modes.HIDDEN;
//   if (showPressPlayPrompt) controlPanelMode = Modes.PLAY;
//   if (showUnmutePrompt && isMuted) controlPanelMode = Modes.UNMUTE;

  if (hideUI === 'true')
    controlPanelMode = Modes.HIDDEN;

    // MAINTENANCE + LOGGING FUNCTIONS:
    const timeout = delay => new Promise((resolve, reject) => {
      setTimeout(() => {
        const err = new Error('timeout exceeded');
        err.isTimeout = true;
        reject(err);
      }, delay);
    });
    
    const time = () => new Date().toString().match(/\d\d:\d\d:\d\d/)[0];
    const log = DEBUG ? (...args) => console.log(`[${time()}]`, ...args) : () => {};
    const trace = DEBUG ?
      (label, fn) => (...args) => {
        log(`[${label}]`, ...args);
        fn(...args);
    } : (label, fn) => fn;
    return(

    <>
        <div className={'player relative'} id='playerel'>
          
          {/* This is your actual stream component. */}
          <video
            ref={videoEl} className={'z-0'} controls={false} autoPlay={false} muted={false} playsInline={true}
            preload='metadata' />

        {/* Hideui is temporary in case we do end up using a control panel. */}
      {videoEl.current?
      // if not hidden and the video element is there
        <>
        {/* If you can't autoplay then display popup to press. */}
          {showPressPlayPrompt?
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
          {/* <div className='THEDIVIDER BETWEEN VID AND CP'></div>
        <ControlPanel
        mode={controlPanelMode}
        onPlay={onPressPlay}
        onUnmute={toggleMute}
        onDismiss={dismissControlPanel} /> */}
        </>
        :null // no render if no video el.
      }
    </div>

    {/* If question live state is set, then render the game component. */}
    {/* Moved this to livestream component */}
    {/* {getQuestionLive?<Game gameStarted={gameStarted} setGameStarted={setGameStarted} leaving={leaving} setLeaving={setLeaving}/>:null} */}

    </>
    )
}