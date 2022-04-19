import React, { MouseEvent, RefObject } from 'react'

import { useSettings } from '../context/SettingsContext'
import { useOutgoingNostrEvents } from '../context/NostrEventsContext'
import * as NIP01 from '../util/nostr/nip01'
import * as NostrEvents from '../util/nostr/events'
import { getSession } from '../util/session'
import * as AppUtils from '../util/pgnrui'

interface CreateGameButtonProps {
  onGameCreated: (e: MouseEvent<HTMLButtonElement>, gameId: NIP01.Sha256) => void
  buttonRef?: RefObject<HTMLButtonElement>
}

export default function CreateGameButton({ buttonRef, onGameCreated }: CreateGameButtonProps) {
  const outgoingNostr = useOutgoingNostrEvents()
  const settings = useSettings()

  const publicKeyOrNull = settings.identity?.pubkey || null
  const privateKeyOrNull = getSession()?.privateKey || null

  const onStartGameButtonClicked = async (e: MouseEvent<HTMLButtonElement>) => {
    // TODO: do not use window.alert..
    if (!outgoingNostr) {
      window.alert('Nostr EventBus not ready..')
      return
    }
    if (!publicKeyOrNull) {
      window.alert('PubKey not available..')
      return
    }
    if (!privateKeyOrNull) {
      window.alert('PrivKey not available..')
      return
    }

    const publicKey = publicKeyOrNull!
    const privateKey = privateKeyOrNull!

    const event = AppUtils.constructStartGameEvent(publicKey)
    const signedEvent = await NostrEvents.signEvent(event, privateKey)
    outgoingNostr.emit(NIP01.ClientEventType.EVENT, NIP01.createClientEventMessage(signedEvent))

    onGameCreated(e, signedEvent.id)
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className="bg-white bg-opacity-20 rounded px-2 py-1"
      onClick={(e: MouseEvent<HTMLButtonElement>) => onStartGameButtonClicked(e)}
    >
      Start new game
    </button>
  )
}
