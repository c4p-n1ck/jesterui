import React, { useEffect, useState } from 'react'
import './App.css'
import AppNavbar from './components/AppNavbar'
import Settings from './components/Settings'
import Layout from './Layout'

import { useCurrentGame, useSetCurrentGame, Game } from './context/GamesContext'
import Chessboard from './components/chessground/Chessground'
import PgnTable from './components/chessground/PgnTable'

import { useSettings, Subscription } from './context/SettingsContext'
import { useWebsocket, send as websocketSend } from './context/WebsocketContext'
import * as NIP01 from './util/nostr/nip01'
import * as NostrEvents from './util/nostr/events'
import { getSession } from './util/session'

// @ts-ignore
import Heading1 from '@material-tailwind/react/Heading1'
// @ts-ignore
import Chess from 'chess.js'
import { ChessInstance } from './components/ChessJsTypes'
import * as cg from 'chessground/types'
import { Route, Routes, Navigate } from 'react-router-dom'

function BoardContainer({ game, onGameChanged }: { game: Game; onGameChanged: (game: ChessInstance) => void }) {
  const updateGameCallback = (modify: (g: ChessInstance) => void) => {
    console.debug('[Chess] updateGameCallback invoked')
    const copyOfGame = { ...game.game }
    modify(copyOfGame)
    onGameChanged(copyOfGame)
  }

  return (
    <div style={{ display: 'flex' }}>
      <div style={{ width: 400, height: 400 }}>
        {game && <Chessboard game={game!.game} userColor={game!.color} onAfterMoveFinished={updateGameCallback} />}
      </div>
      {game && (
        <div className="pl-2 overflow-y-scroll">
          <PgnTable game={game!.game} />
        </div>
      )}
    </div>
  )
}

function Index() {
  const websocket = useWebsocket()
  const setCurrentGame = useSetCurrentGame()
  const game = useCurrentGame()
  const settings = useSettings()

  const publicKeyOrNull = settings.identity?.pubkey || null
  const privateKeyOrNull = getSession()?.privateKey || null

  const onGameChanged = (game: ChessInstance) => {
    setCurrentGame((currentGame) => {
      if (!currentGame) return null
      return { ...currentGame, game }
    })
    sendGameStateViaNostr(game)
  }

  const sendGameStateViaNostr = async (game: ChessInstance) => {
    if (!websocket) {
      console.info('Websocket not available..')
      return
    }
    if (!publicKeyOrNull) {
      console.info('PubKey not available..')
      return
    }
    if (!privateKeyOrNull) {
      console.info('PrivKey not available..')
      return
    }

    const publicKey = publicKeyOrNull!
    const privateKey = privateKeyOrNull!

    const eventParts = NostrEvents.blankEvent()
    eventParts.kind = 1 // text_note
    eventParts.pubkey = publicKey
    eventParts.created_at = Math.floor(Date.now() / 1000)
    eventParts.content = game.fen()
    const event = NostrEvents.constructEvent(eventParts)
    const signedEvent = await NostrEvents.signEvent(event, privateKey)
    const req = NIP01.createClientEventMessage(signedEvent)

    const abortCtrl = new AbortController()
    console.debug('[Nostr] -> ', req)
    websocketSend(websocket, req, { signal: abortCtrl.signal })
  }

  useEffect(() => {
    setCurrentGame((currentGame) => {
      if (currentGame) return currentGame

      const color = ['white', 'black'][Math.floor(Math.random() * 2)] as cg.Color
      return {
        game: new Chess(),
        color: ['white', 'black'] || [color], // TODO: currently make it possible to move both colors
      }
    })
  }, [setCurrentGame])

  return (
    <div className="screen-index">
      <Heading1 color="blueGray">Gameboard</Heading1>
      {game && <BoardContainer game={game} onGameChanged={onGameChanged} />}
    </div>
  )
}

function NostrManageSubscriptions() {
  const settings = useSettings()
  const websocket = useWebsocket()

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [closeSubscriptions, setCloseSubscriptions] = useState<Subscription[]>([])

  useEffect(() => {
    if (!websocket) return
    if (closeSubscriptions.length === 0) return

    const abortCtrl = new AbortController()

    closeSubscriptions.forEach((sub) => {
      const req: NIP01.ClientCloseMessage = NIP01.createClientCloseMessage(sub.id)
      console.debug('[Nostr] -> CLOSE', sub.id)
      websocketSend(websocket, req, { signal: abortCtrl.signal })
    })

    setCloseSubscriptions([])
    return () => abortCtrl.abort()
  }, [websocket, closeSubscriptions])

  useEffect(() => {
    if (!websocket) return
    if (subscriptions.length === 0) return

    const abortCtrl = new AbortController()

    subscriptions.forEach((sub) => {
      const req: NIP01.ClientReqMessage = NIP01.createClientReqMessage(sub.id, sub.filters)
      console.debug('[Nostr] -> REQ', sub.id, sub.filters)
      websocketSend(websocket, req, { signal: abortCtrl.signal })
    })

    return () => abortCtrl.abort()
  }, [websocket, subscriptions])

  useEffect(() => {}, [websocket])

  useEffect(() => {
    if (!websocket) return

    const resubscribe = true // TODO: only for changed subscriptions..

    if (resubscribe) {
      setSubscriptions((val) => {
        setCloseSubscriptions(val)
        return settings.subscriptions || []
      })
    }
  }, [websocket, settings])

  return <></>
}

function NostrLogIncomingRelayEvents() {
  const websocket = useWebsocket()

  useEffect(() => {
    if (!websocket) return

    const abortCtrl = new AbortController()

    websocket.addEventListener(
      'message',
      ({ data: json }) => {
        console.info(`[Nostr] <- ${json}`)
      },
      { signal: abortCtrl.signal }
    )

    return () => abortCtrl.abort()
  }, [websocket])

  return <></>
}

export default function App() {
  return (
    <>
      <>
        <NostrManageSubscriptions />
        <NostrLogIncomingRelayEvents />
      </>
      <div className="App">
        <header className="App-header w-full">
          <AppNavbar />
        </header>
        <section className="App-container">
          <Routes>
            <Route element={<Layout variant={null} />}>
              <Route path="/" element={<Index />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace={true} />} />
            </Route>
          </Routes>
        </section>
        <footer className="App-footer">
          <a className="App-link" href="https://reactjs.org" target="_blank" rel="noopener noreferrer">
            View on GitHub
          </a>
        </footer>
      </div>
    </>
  )
}
