import React from 'react';
import HLSPlayer from './HLSPlayer';
import MobileHLSPlayer from './MobileHLSPlayer';
import {useGameStore} from '../store';

// This component checks if we are in MOBILE or Desktop, and renders appropriate player.
  // theme, hideUI = false
const Player = ({ game, hideUI, questionLive}) => {
    const isMseSupported = window.MediaSource || window.WebKitMediaSource;
    // const props = { url: game.hlsUrl };
    // console.log(game)
        // , theme, hideUI
        const getStream = useGameStore((state) => state.gameStream)
  return(
    <div>

      {/* pull game.hlsUrl from activefetch to perm store. */}
        {getStream?
            isMseSupported? //if MSE supported (DESKTOP), display the normal HLS JS player, otherwise display MOBILE.
            <HLSPlayer 
            
            hideUI={hideUI}
           /> 
            : 
            <MobileHLSPlayer 
            
            />
            :null // display nothing if there is no URL
    }
    </div>
  )
};

export default Player;